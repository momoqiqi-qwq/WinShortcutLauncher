use reqwest::blocking::{Client, Response};
use reqwest::header::{ACCEPT, CACHE_CONTROL, CONTENT_TYPE, RANGE, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  env, fs,
  io::Read,
  path::{Path, PathBuf},
  sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Condvar, Mutex, OnceLock,
  },
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const HTTP_TIMEOUT: Duration = Duration::from_secs(6);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const TITLE_CACHE_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
/// v156：抓标题失败后短时间内直接返回失败，别让同一个死站反复吃掉 6 秒。
const TITLE_FAILURE_TTL: Duration = Duration::from_secs(60);
/// v161：失败黑名单的上限。条目本身 60 秒就过期，这里只是防止批量导入大量死链时无限增长。
const TITLE_FAILURE_MAX_ENTRIES: usize = 512;
/// v161：标题缓存落盘时最多保留的条目数（按保存时间取最新）。
const TITLE_CACHE_MAX_ENTRIES: usize = 4000;
const MAX_TITLE_HTML_BYTES: u64 = 512 * 1024;
/// v156：边收边解析的读块大小。<title> 基本都在第一块里。
const TITLE_CHUNK_BYTES: usize = 8 * 1024;
const MAX_FAVICON_BYTES: usize = 4 * 1024 * 1024;
/// v163：页面自带图标解析失败后，短时间内不再为同一个网址重复抓 HTML。
const PAGE_ICON_MISS_TTL: Duration = Duration::from_secs(10 * 60);
const PAGE_ICON_MISS_MAX_ENTRIES: usize = 256;
/// v163：一页里最多尝试几个图标声明（有些站点页头塞十几个 `<link rel=icon>`）。
const PAGE_ICON_MAX_CANDIDATES: usize = 8;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FaviconTestResult {
  pub provider_id: String,
  pub provider_name: String,
  pub group: String,
  pub success: bool,
  pub elapsed_ms: u128,
  pub url: Option<String>,
  pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TitleCacheEntry {
  title: String,
  saved_at_ms: u64,
}

#[derive(Default)]
struct InFlightString {
  result: Mutex<Option<Result<String, String>>>,
  ready: Condvar,
}

type InFlightMap = Mutex<HashMap<String, Arc<InFlightString>>>;

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();
static TITLE_CACHE: OnceLock<Mutex<HashMap<String, TitleCacheEntry>>> = OnceLock::new();
static TITLE_IN_FLIGHT: OnceLock<InFlightMap> = OnceLock::new();
static FAVICON_IN_FLIGHT: OnceLock<InFlightMap> = OnceLock::new();
/// v163：网址 → 最近一次解析页面图标失败的时间戳（毫秒）。
static PAGE_ICON_MISS: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
/// v156：网址 → 最近一次抓标题失败的时间戳（毫秒），短期黑名单。
static TITLE_FAILURE: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();
/// v161：标题缓存每改一次加一；落盘时只写比上次落盘更新的快照，避免旧快照覆盖新快照。
static TITLE_CACHE_GENERATION: AtomicU64 = AtomicU64::new(0);
/// v161：串行化落盘（临时文件 + 改名），并记录已经写到磁盘的代号。
static TITLE_CACHE_PERSISTED: Mutex<u64> = Mutex::new(0);

fn http_client() -> Result<&'static Client, String> {
  if let Some(client) = HTTP_CLIENT.get() {
    return Ok(client);
  }
  let client = Client::builder()
    .connect_timeout(CONNECT_TIMEOUT)
    .timeout(HTTP_TIMEOUT)
    .redirect(reqwest::redirect::Policy::limited(5))
    // v156：连接池留得更久、更宽，同一站点第二次拖入时省掉 TCP + TLS 握手。
    .pool_idle_timeout(Duration::from_secs(300))
    .pool_max_idle_per_host(16)
    .tcp_keepalive(Duration::from_secs(60))
    .tcp_nodelay(true)
    .build()
    .map_err(|error| error.to_string())?;
  let _ = HTTP_CLIENT.set(client);
  HTTP_CLIENT.get().ok_or_else(|| "HTTP client 初始化失败".to_string())
}

fn launcher_cache_dir() -> PathBuf {
  #[cfg(target_os = "windows")]
  {
    if let Ok(appdata) = env::var("APPDATA") {
      return PathBuf::from(appdata).join("WinShortcutLauncher").join("favicons");
    }
  }
  if let Ok(home) = env::var("HOME") {
    return PathBuf::from(home).join(".win-shortcut-launcher").join("favicons");
  }
  env::temp_dir().join("win-shortcut-launcher").join("favicons")
}

fn title_cache_path() -> PathBuf {
  launcher_cache_dir().join("website_titles.json")
}

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis()
    .min(u64::MAX as u128) as u64
}

fn title_cache() -> &'static Mutex<HashMap<String, TitleCacheEntry>> {
  TITLE_CACHE.get_or_init(|| {
    let now = now_ms();
    let max_age = TITLE_CACHE_TTL.as_millis() as u64;
    let cache = fs::read_to_string(title_cache_path())
      .ok()
      .and_then(|raw| serde_json::from_str::<HashMap<String, TitleCacheEntry>>(&raw).ok())
      .unwrap_or_default()
      .into_iter()
      .filter(|(_, entry)| now.saturating_sub(entry.saved_at_ms) <= max_age && !entry.title.trim().is_empty())
      .collect();
    Mutex::new(cache)
  })
}

/// v161：持有缓存锁时只做内存操作，拿到快照后立即放锁，再在锁外写盘。
/// 以前在 `title_cache()` 锁里直接 `fs::write`，磁盘慢（杀软扫描、网络盘、休眠硬盘）时
/// 所有查标题的线程都会排队等这把锁。
fn snapshot_title_cache(cache: &HashMap<String, TitleCacheEntry>) -> (u64, HashMap<String, TitleCacheEntry>) {
  let generation = TITLE_CACHE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
  (generation, prune_title_cache(cache, now_ms()))
}

/// 去掉过期 / 空标题条目，并把总数限制在 `TITLE_CACHE_MAX_ENTRIES`（保留最新的）。
fn prune_title_cache(cache: &HashMap<String, TitleCacheEntry>, now: u64) -> HashMap<String, TitleCacheEntry> {
  let max_age = TITLE_CACHE_TTL.as_millis() as u64;
  let mut live: Vec<(&String, &TitleCacheEntry)> = cache
    .iter()
    .filter(|(_, entry)| now.saturating_sub(entry.saved_at_ms) <= max_age && !entry.title.trim().is_empty())
    .collect();
  if live.len() > TITLE_CACHE_MAX_ENTRIES {
    live.sort_by_key(|(_, entry)| std::cmp::Reverse(entry.saved_at_ms));
    live.truncate(TITLE_CACHE_MAX_ENTRIES);
  }
  live.into_iter().map(|(url, entry)| (url.clone(), entry.clone())).collect()
}

fn persist_title_snapshot(generation: u64, snapshot: &HashMap<String, TitleCacheEntry>) {
  let mut persisted = TITLE_CACHE_PERSISTED.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  if generation <= *persisted {
    // 已经有更新的快照落过盘了。
    return;
  }
  if write_title_cache_file(snapshot) {
    *persisted = generation;
  }
}

fn write_title_cache_file(cache: &HashMap<String, TitleCacheEntry>) -> bool {
  let path = title_cache_path();
  let Some(parent) = path.parent() else { return false; };
  if fs::create_dir_all(parent).is_err() {
    return false;
  }
  let Ok(raw) = serde_json::to_vec(cache) else { return false; };
  let temp = path.with_extension("json.tmp");
  if fs::write(&temp, raw).is_err() {
    return false;
  }
  if fs::rename(&temp, &path).is_err() {
    let _ = fs::remove_file(&path);
    return fs::rename(&temp, &path).is_ok();
  }
  true
}

fn normalize_url(value: &str) -> Result<String, String> {
  let trimmed = value.trim();
  if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
    return Err("只支持 http/https 网址".to_string());
  }
  let mut parsed = reqwest::Url::parse(trimmed).map_err(|_| "无法解析网址".to_string())?;
  parsed.set_fragment(None);
  Ok(parsed.to_string())
}

fn host_from_url(value: &str) -> String {
  reqwest::Url::parse(value)
    .ok()
    .and_then(|url| url.host_str().map(str::to_ascii_lowercase))
    .unwrap_or_default()
}

fn safe_file_part(value: &str) -> String {
  let mut out = String::new();
  for ch in value.chars() {
    if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
      out.push(ch);
    } else {
      out.push('_');
    }
  }
  if out.is_empty() { "site".to_string() } else { out }
}

/// v163：子域即站点的公共托管后缀。对这些后缀必须保留完整主机名，
/// 否则 `treapgogo.github.io/deepseek-whale-girl/` 会被当成 `github.io`，
/// 第三方图标服务按这个域名查回来的必然是 GitHub 自己的图标。
const HOSTED_PLATFORM_SUFFIXES: [&str; 24] = [
  "github.io", "gitlab.io", "gitee.io", "githubusercontent.com",
  "netlify.app", "vercel.app", "pages.dev", "workers.dev", "web.app",
  "firebaseapp.com", "blogspot.com", "neocities.org", "surge.sh",
  "onrender.com", "deno.dev", "replit.app", "glitch.me", "fly.dev",
  "herokuapp.com", "azurewebsites.net", "cloudfront.net", "s3.amazonaws.com",
  "readthedocs.io", "now.sh",
];

fn is_hosted_platform_host(host: &str) -> bool {
  HOSTED_PLATFORM_SUFFIXES
    .iter()
    .any(|suffix| host == *suffix || host.ends_with(&format!(".{}", suffix)))
}

fn favicon_cache_domain(host: &str) -> String {
  const COMPOUND_SUFFIXES: [&str; 18] = [
    "com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn",
    "co.uk", "org.uk", "ac.uk",
    "com.au", "net.au", "org.au",
    "co.jp", "ne.jp", "or.jp",
    "co.kr", "com.br", "com.sg", "com.hk",
  ];

  let normalized = host.trim().trim_end_matches('.').trim_start_matches("www.").to_ascii_lowercase();
  if normalized.is_empty() || normalized == "localhost" || normalized.contains(':') {
    return normalized;
  }
  if normalized.split('.').all(|part| !part.is_empty() && part.chars().all(|ch| ch.is_ascii_digit())) {
    return normalized;
  }
  if is_hosted_platform_host(&normalized) {
    return normalized;
  }

  let labels = normalized.split('.').filter(|part| !part.is_empty()).collect::<Vec<_>>();
  if labels.len() <= 2 {
    return normalized;
  }
  let last_two = format!("{}.{}", labels[labels.len() - 2], labels[labels.len() - 1]);
  if COMPOUND_SUFFIXES.contains(&last_two.as_str()) && labels.len() >= 3 {
    return format!("{}.{}", labels[labels.len() - 3], last_two);
  }
  last_two
}

fn is_favicon_file(path: &Path) -> bool {
  path.extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| matches!(ext.to_ascii_lowercase().as_str(), "png" | "svg" | "ico" | "webp" | "jpg" | "jpeg" | "gif"))
    .unwrap_or(false)
}

fn cached_favicon_for_domain(dir: &Path, cache_domain: &str) -> Option<PathBuf> {
  let canonical_prefix = format!("site_{}", safe_file_part(cache_domain));
  let mut candidates: Vec<(SystemTime, PathBuf)> = Vec::new();
  let entries = fs::read_dir(dir).ok()?;
  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() || !is_favicon_file(&path) {
      continue;
    }
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or_default();
    let is_canonical = stem == canonical_prefix;
    let legacy_host = stem.split('_').next().unwrap_or_default().to_ascii_lowercase();
    let is_same_site_legacy = legacy_host == cache_domain || legacy_host.ends_with(&format!(".{}", cache_domain));
    if !is_canonical && !is_same_site_legacy {
      continue;
    }
    let modified = entry.metadata().and_then(|meta| meta.modified()).unwrap_or(UNIX_EPOCH);
    candidates.push((modified, path));
  }
  candidates.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
  candidates.into_iter().map(|(_, path)| path).next()
}

/// v163：同一个站点下不同路径可能是完全不同的小站（`a.github.io/proj-1/` 与 `/proj-2/`），
/// 共用一张域名图标会互相污染。页面级缓存因此按「完整网址」派生文件名前缀。
fn page_icon_prefix(url: &str) -> String {
  let key = reqwest::Url::parse(url)
    .map(|mut parsed| {
      parsed.set_query(None);
      parsed.set_fragment(None);
      parsed.to_string()
    })
    .unwrap_or_else(|_| url.to_string());
  let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
  for byte in key.as_bytes() {
    hash ^= u64::from(*byte);
    hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
  }
  format!("page_{:016x}", hash)
}

fn cached_icon_with_prefix(dir: &Path, prefix: &str) -> Option<PathBuf> {
  let mut candidates: Vec<(SystemTime, PathBuf)> = Vec::new();
  for entry in fs::read_dir(dir).ok()?.flatten() {
    let path = entry.path();
    if !path.is_file() || !is_favicon_file(&path) {
      continue;
    }
    if path.file_stem().and_then(|value| value.to_str()) != Some(prefix) {
      continue;
    }
    let modified = entry.metadata().and_then(|meta| meta.modified()).unwrap_or(UNIX_EPOCH);
    candidates.push((modified, path));
  }
  candidates.sort_by_key(|(modified, _)| std::cmp::Reverse(*modified));
  candidates.into_iter().map(|(_, path)| path).next()
}

/// v163：删掉同一前缀下的其它扩展名变体（`site_x` 与 `page_<hash>` 共用这套逻辑）。
fn remove_icon_variants(dir: &Path, prefix: &str, except: Option<&Path>) {
  let Ok(entries) = fs::read_dir(dir) else { return; };
  for entry in entries.flatten() {
    let path = entry.path();
    if except.is_some_and(|keep| keep == path.as_path()) {
      continue;
    }
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or_default();
    if stem == prefix && is_favicon_file(&path) {
      let _ = fs::remove_file(path);
    }
  }
}

fn remove_canonical_favicon_variants(dir: &Path, cache_domain: &str, except: Option<&Path>) {
  remove_icon_variants(dir, &format!("site_{}", safe_file_part(cache_domain)), except);
}

fn favicon_provider_meta(id: &str) -> (&'static str, &'static str) {
  match id {
    "page" => ("页面自带图标", "直连"),
    "quicker" => ("Quicker", "国内"),
    "faviconIm" => ("Favicon.im", "国内"),
    "iowen" => ("Iowen", "国内"),
    "google" => ("Google", "国外"),
    "duckduckgo" => ("DuckDuckGo", "国外"),
    "clearbit" => ("Clearbit", "国外"),
    "iconHorse" => ("Icon Horse", "国外"),
    "faviconKit" => ("FaviconKit", "国外"),
    "yandex" => ("Yandex", "国外"),
    "direct" => ("网站 /favicon.ico", "直连"),
    _ => ("自动兜底", "国内"),
  }
}

fn favicon_provider_order(provider_id: Option<&str>, fallback: bool) -> Vec<&'static str> {
  // v163：`page` 排第一 —— 网站自己在 HTML 里声明的图标，永远比按域名猜的第三方图标准。
  const DEFAULTS: [&str; 11] = ["page", "quicker", "faviconIm", "iowen", "google", "duckduckgo", "clearbit", "iconHorse", "faviconKit", "yandex", "direct"];
  let selected = provider_id.unwrap_or("auto");
  if selected == "auto" || selected.trim().is_empty() {
    return DEFAULTS.to_vec();
  }
  let selected_static = match selected {
    "page" => "page",
    "quicker" => "quicker",
    "faviconIm" => "faviconIm",
    "iowen" => "iowen",
    "google" => "google",
    "duckduckgo" => "duckduckgo",
    "clearbit" => "clearbit",
    "iconHorse" => "iconHorse",
    "faviconKit" => "faviconKit",
    "yandex" => "yandex",
    "direct" => "direct",
    _ => "quicker",
  };
  if !fallback {
    return vec![selected_static];
  }
  let mut out = vec![selected_static];
  for item in DEFAULTS {
    if item != selected_static {
      out.push(item);
    }
  }
  out
}

fn favicon_candidate_url(provider: &str, host: &str, raw_url: &str) -> String {
  match provider {
    // v163：页面声明的图标要抓 HTML 才能知道，这里的「候选」就是页面本身。
    "page" => raw_url.to_string(),
    "quicker" => format!("https://helperservice.getquicker.cn/favicon/get/{}", host),
    "faviconIm" => format!("https://favicon.im/{}", host),
    "iowen" => format!("https://api.iowen.cn/favicon/{}.png", host),
    "google" => format!("https://www.google.com/s2/favicons?domain={}&sz=128", host),
    "duckduckgo" => format!("https://icons.duckduckgo.com/ip3/{}.ico", host),
    "clearbit" => format!("https://logo.clearbit.com/{}", host),
    "iconHorse" => format!("https://icon.horse/icon/{}", host),
    "faviconKit" => format!("https://api.faviconkit.com/{}/128", host),
    "yandex" => format!("https://favicon.yandex.net/favicon/{}", host),
    "direct" => {
      let scheme = if raw_url.starts_with("http://") { "http" } else { "https" };
      format!("{}://{}/favicon.ico", scheme, host)
    }
    _ => format!("https://helperservice.getquicker.cn/favicon/get/{}", host),
  }
}

fn append_refresh_token(url: String, force_refresh: bool) -> String {
  if !force_refresh {
    return url;
  }
  let separator = if url.contains('?') { "&" } else { "?" };
  format!("{}{}yue_refresh={}", url, separator, now_ms())
}

fn dedupe_string<F>(key: String, map: &'static InFlightMap, operation: F) -> Result<String, String>
where
  F: FnOnce() -> Result<String, String>,
{
  let (entry, leader) = {
    let mut requests = map.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(existing) = requests.get(&key) {
      (existing.clone(), false)
    } else {
      let created = Arc::new(InFlightString::default());
      requests.insert(key.clone(), created.clone());
      (created, true)
    }
  };

  if !leader {
    let mut result = entry.result.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    while result.is_none() {
      result = entry.ready.wait(result).unwrap_or_else(|poisoned| poisoned.into_inner());
    }
    return result.clone().unwrap_or_else(|| Err("请求去重状态异常".to_string()));
  }

  let outcome = operation();
  {
    let mut result = entry.result.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    *result = Some(outcome.clone());
    entry.ready.notify_all();
  }
  let mut requests = map.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  requests.remove(&key);
  outcome
}

/// v156：在字节层面做大小写不敏感的查找，避免为了找 `</title>` 把整页 HTML 复制成小写。
fn find_ascii_ci(haystack: &[u8], needle: &[u8]) -> Option<usize> {
  if needle.is_empty() || haystack.len() < needle.len() {
    return None;
  }
  let first = needle[0].to_ascii_lowercase();
  let last_start = haystack.len() - needle.len();
  let mut index = 0;
  while index <= last_start {
    if haystack[index].to_ascii_lowercase() == first
      && haystack[index..index + needle.len()]
        .iter()
        .zip(needle)
        .all(|(left, right)| left.to_ascii_lowercase() == *right)
    {
      return Some(index);
    }
    index += 1;
  }
  None
}

fn charset_from_content_type(content_type: &str) -> Option<String> {
  let lower = content_type.to_ascii_lowercase();
  let position = lower.find("charset=")?;
  let rest = lower[position + "charset=".len()..].trim_start_matches(['"', '\'']);
  let label = rest
    .split(['"', '\'', ';', ' ', ','])
    .next()
    .unwrap_or("")
    .trim();
  (!label.is_empty()).then(|| label.to_string())
}

fn sniff_charset(head: &[u8]) -> Option<String> {
  let text = String::from_utf8_lossy(head).to_ascii_lowercase();
  let position = text.find("charset=")?;
  let rest = text[position + "charset=".len()..].trim_start_matches(['"', '\'']);
  let label = rest
    .split(['"', '\'', ';', ' ', '/', '>'])
    .next()
    .unwrap_or("")
    .trim();
  (!label.is_empty()).then(|| label.to_string())
}

/// v156：按页面声明的编码解码标题。国内站点大量是 GBK/GB18030，按 UTF-8 硬解会成乱码。
fn resolve_encoding(content_type: &str, head: &[u8]) -> &'static encoding_rs::Encoding {
  charset_from_content_type(content_type)
    .or_else(|| sniff_charset(head))
    .and_then(|label| encoding_rs::Encoding::for_label(label.as_bytes()))
    .unwrap_or(encoding_rs::UTF_8)
}

fn decode_title_bytes(bytes: &[u8], encoding: &'static encoding_rs::Encoding) -> Option<String> {
  let (decoded, _, _) = encoding.decode(bytes);
  let text = html_escape::decode_html_entities(decoded.as_ref());
  let collapsed = text.split_whitespace().collect::<Vec<_>>().join(" ");
  let title = collapsed.chars().take(120).collect::<String>();
  (!title.is_empty()).then_some(title)
}

fn title_from_bytes(buffer: &[u8], content_type: &str) -> Option<String> {
  let start = find_ascii_ci(buffer, b"<title")?;
  let open_end = start + buffer[start..].iter().position(|value| *value == b'>')? + 1;
  let close = find_ascii_ci(&buffer[open_end..], b"</title>")? + open_end;
  let head = &buffer[..buffer.len().min(2048)];
  decode_title_bytes(&buffer[open_end..close], resolve_encoding(content_type, head))
}

/// v156：边收边解析。标题几乎总在前 8KB，拿到 `</title>` 立刻返回，
/// 不再等整页（最多 512KB）下载完；同时把 6 秒超时的概率压到最低。
fn read_title_stream(mut response: Response, content_type: &str) -> Result<String, String> {
  let mut buffer: Vec<u8> = Vec::with_capacity(TITLE_CHUNK_BYTES * 2);
  let mut chunk = [0u8; TITLE_CHUNK_BYTES];
  let mut title_start: Option<usize> = None;
  loop {
    let read = response.read(&mut chunk).map_err(|error| error.to_string())?;
    if read == 0 {
      break;
    }
    buffer.extend_from_slice(&chunk[..read]);
    if title_start.is_none() {
      title_start = find_ascii_ci(&buffer, b"<title");
    }
    if let Some(start) = title_start {
      if let Some(open_rel) = buffer[start..].iter().position(|value| *value == b'>') {
        let open_end = start + open_rel + 1;
        if let Some(close_rel) = find_ascii_ci(&buffer[open_end..], b"</title>") {
          let head = &buffer[..buffer.len().min(2048)];
          let encoding = resolve_encoding(content_type, head);
          if let Some(title) = decode_title_bytes(&buffer[open_end..open_end + close_rel], encoding) {
            return Ok(title);
          }
        }
      }
    }
    if buffer.len() >= MAX_TITLE_HTML_BYTES as usize {
      break;
    }
  }
  title_from_bytes(&buffer, content_type).ok_or_else(|| "未获取到网页标题".to_string())
}

/// v156：返回（标题，重定向后的最终网址），最终网址也进缓存，下次拖同一入口就是秒开。
fn fetch_title_http(url: &str) -> Result<(String, String), String> {
  let client = http_client()?;
  let response = client
    .get(url)
    .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YueLauncher/0.1")
    .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
    .header(RANGE, format!("bytes=0-{}", MAX_TITLE_HTML_BYTES - 1))
    .send()
    .map_err(|error| error.to_string())?
    .error_for_status()
    .map_err(|error| error.to_string())?;
  let final_url = response.url().to_string();
  let content_type = response
    .headers()
    .get(CONTENT_TYPE)
    .and_then(|value| value.to_str().ok())
    .unwrap_or("")
    .to_string();
  let lowered = content_type.to_ascii_lowercase();
  // 拖进来的可能是 PDF / 图片直链，读下去纯属浪费，直接判失败。
  if lowered.starts_with("image/")
    || lowered.starts_with("video/")
    || lowered.starts_with("audio/")
    || lowered.contains("application/pdf")
    || lowered.contains("application/octet-stream")
    || lowered.contains("application/zip")
  {
    return Err("该网址不是网页，没有标签页标题".to_string());
  }
  let title = read_title_stream(response, &content_type)?;
  Ok((title, final_url))
}

fn get_cached_title(url: &str) -> Option<String> {
  let now = now_ms();
  let max_age = TITLE_CACHE_TTL.as_millis() as u64;
  let mut cache = title_cache().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  let entry = cache.get(url)?.clone();
  if now.saturating_sub(entry.saved_at_ms) > max_age {
    // 只从内存里删；过期条目会在下次落盘时被 prune_title_cache 过滤掉，这里不必为它单独写盘。
    cache.remove(url);
    return None;
  }
  Some(entry.title)
}

fn store_cached_titles(entries: Vec<(String, String)>) {
  if entries.is_empty() {
    return;
  }
  let saved_at_ms = now_ms();
  let (generation, snapshot) = {
    let mut cache = title_cache().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    for (url, title) in entries {
      cache.insert(url, TitleCacheEntry { title, saved_at_ms });
    }
    snapshot_title_cache(&cache)
  };
  persist_title_snapshot(generation, &snapshot);
}

fn title_failures() -> &'static Mutex<HashMap<String, u64>> {
  TITLE_FAILURE.get_or_init(Default::default)
}

fn title_recently_failed(url: &str) -> bool {
  let now = now_ms();
  let ttl = TITLE_FAILURE_TTL.as_millis() as u64;
  let mut failures = title_failures().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  match failures.get(url).copied() {
    Some(at) if now.saturating_sub(at) <= ttl => true,
    Some(_) => {
      failures.remove(url);
      false
    }
    None => false,
  }
}

fn mark_title_failure(url: &str) {
  let now = now_ms();
  let mut failures = title_failures().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  failures.insert(url.to_string(), now);
  prune_title_failures(&mut failures, now);
}

/// v161：以前过期条目只有在同一个网址再次被查询时才删除，从没再查过的死链会一直留在内存里。
fn prune_title_failures(failures: &mut HashMap<String, u64>, now: u64) {
  let ttl = TITLE_FAILURE_TTL.as_millis() as u64;
  failures.retain(|_, at| now.saturating_sub(*at) <= ttl);
  if failures.len() > TITLE_FAILURE_MAX_ENTRIES {
    let mut stamps: Vec<u64> = failures.values().copied().collect();
    stamps.sort_unstable_by(|a, b| b.cmp(a));
    let cutoff = stamps[TITLE_FAILURE_MAX_ENTRIES - 1];
    failures.retain(|_, at| *at >= cutoff);
  }
}

fn clear_title_failure(url: &str) {
  let mut failures = title_failures().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  failures.remove(url);
}

fn fetch_website_title_blocking(url: String) -> Result<String, String> {
  let normalized = normalize_url(&url)?;
  if let Some(title) = get_cached_title(&normalized) {
    return Ok(title);
  }
  if title_recently_failed(&normalized) {
    return Err("刚抓过一次标题没成功，稍后再试".to_string());
  }
  let key = normalized.clone();
  let cache_key = normalized.clone();
  let outcome = dedupe_string(key.clone(), TITLE_IN_FLIGHT.get_or_init(Default::default), move || {
    if let Some(title) = get_cached_title(&key) {
      return Ok(title);
    }
    let (title, final_url) = fetch_title_http(&key)?;
    store_cached_titles(vec![(key.clone(), title.clone()), (final_url, title.clone())]);
    Ok(title)
  });
  match &outcome {
    Ok(_) => clear_title_failure(&cache_key),
    Err(_) => mark_title_failure(&cache_key),
  }
  outcome
}

/// v156：拖拽悬停阶段就预热标题抓取。
/// 用户从浏览器拖到落点通常还要几百毫秒，等他松手时标题往往已经在缓存里了。
pub fn prefetch_title(url: &str) {
  let Ok(normalized) = normalize_url(url) else { return; };
  if get_cached_title(&normalized).is_some() || title_recently_failed(&normalized) {
    return;
  }
  // 只是预热缓存，不等结果：丢掉 JoinHandle 即可让任务在后台跑完。
  drop(tauri::async_runtime::spawn_blocking(move || {
    let _ = fetch_website_title_blocking(normalized);
  }));
}

/// v163：把 `<link ...>` / `<meta ...>` 里的属性拆成键值对。
/// 标签内部的属性名/分隔符都是 ASCII，所以只做字节级扫描，不引 HTML 解析库。
fn parse_tag_attributes(tag: &str) -> Vec<(String, String)> {
  let bytes = tag.as_bytes();
  let mut out: Vec<(String, String)> = Vec::new();
  let mut index = 0;
  // 跳过标签名本身：`<link` / `<meta`
  while index < bytes.len() && !bytes[index].is_ascii_whitespace() {
    index += 1;
  }
  while index < bytes.len() {
    while index < bytes.len() && (bytes[index].is_ascii_whitespace() || bytes[index] == b'/') {
      index += 1;
    }
    if index >= bytes.len() {
      break;
    }
    let name_start = index;
    while index < bytes.len() && !bytes[index].is_ascii_whitespace() && bytes[index] != b'=' && bytes[index] != b'/' {
      index += 1;
    }
    let name = tag[name_start..index].to_ascii_lowercase();
    while index < bytes.len() && bytes[index].is_ascii_whitespace() {
      index += 1;
    }
    let mut value = String::new();
    if index < bytes.len() && bytes[index] == b'=' {
      index += 1;
      while index < bytes.len() && bytes[index].is_ascii_whitespace() {
        index += 1;
      }
      if index < bytes.len() && (bytes[index] == b'"' || bytes[index] == b'\'') {
        let quote = bytes[index];
        index += 1;
        let value_start = index;
        while index < bytes.len() && bytes[index] != quote {
          index += 1;
        }
        value = tag[value_start..index].to_string();
        if index < bytes.len() {
          index += 1;
        }
      } else {
        let value_start = index;
        while index < bytes.len() && !bytes[index].is_ascii_whitespace() {
          index += 1;
        }
        value = tag[value_start..index].to_string();
      }
    }
    if !name.is_empty() {
      out.push((name, value));
    }
  }
  out
}

/// v163：`sizes="32x32 256x256"` → 画质加分。小而糊的 16×16 排在后面。
fn icon_size_bonus(sizes: &str) -> i32 {
  for token in sizes.split_whitespace() {
    let Some((width, _height)) = token.split_once('x') else { continue; };
    let Ok(value) = width.parse::<i32>() else { continue; };
    return match value {
      0..=15 => 0,
      16..=31 => 2,
      32..=63 => 4,
      64..=127 => 6,
      128..=255 => 8,
      _ => 9,
    };
  }
  0
}

fn icon_candidate_from_tag(tag_name: &str, attrs: &[(String, String)]) -> Option<(i32, String)> {
  let attr = |name: &str| {
    attrs
      .iter()
      .find(|(key, _)| key == name)
      .map(|(_, value)| value.trim().to_string())
  };
  if tag_name == "link" {
    let rel = attr("rel").unwrap_or_default().to_ascii_lowercase();
    let href = attr("href")?;
    if href.is_empty() {
      return None;
    }
    let weight = if rel.split_whitespace().any(|token| token == "icon") {
      100
    } else if rel.contains("apple-touch-icon-precomposed") {
      96
    } else if rel.contains("apple-touch-icon") {
      95
    } else if rel.contains("mask-icon") {
      90
    } else if rel.contains("image_src") {
      30
    } else {
      return None;
    };
    let mut score = weight;
    if let Some(sizes) = attr("sizes") {
      score += icon_size_bonus(&sizes);
    }
    if attr("type").is_some_and(|value| value.to_ascii_lowercase().contains("svg")) {
      score += 3;
    }
    return Some((score, href));
  }
  let key = attr("property")
    .or_else(|| attr("name"))
    .unwrap_or_default()
    .to_ascii_lowercase();
  if key == "og:image" || key == "twitter:image" {
    let content = attr("content")?;
    return (!content.is_empty()).then_some((40, content));
  }
  None
}

/// v163：按优先级收集页面自己声明的图标地址（`<link rel=icon>` > apple-touch-icon >
/// mask-icon > og:image），同一地址只留一次。
fn collect_page_icon_candidates(html: &str) -> Vec<String> {
  let lower = html.to_ascii_lowercase();
  let mut scored: Vec<(i32, usize, String)> = Vec::new();
  let mut cursor = 0usize;
  while let Some(offset) = lower[cursor..].find('<') {
    let tag_start = cursor + offset;
    if lower[tag_start..].starts_with("<!--") {
      match lower[tag_start..].find("-->") {
        Some(end) => {
          cursor = tag_start + end + 3;
          continue;
        }
        None => break,
      }
    }
    let Some(end_offset) = lower[tag_start..].find('>') else { break; };
    let tag_end = tag_start + end_offset;
    let raw = &html[tag_start..tag_end];
    let name_end = raw[1..]
      .find(|ch: char| ch.is_ascii_whitespace() || ch == '/' || ch == '>')
      .map(|value| value + 1)
      .unwrap_or(raw.len());
    let tag_name = raw[1..name_end].to_ascii_lowercase();
    if tag_name == "link" || tag_name == "meta" {
      let attrs = parse_tag_attributes(raw);
      let order = scored.len();
      if let Some((score, href)) = icon_candidate_from_tag(&tag_name, &attrs) {
        scored.push((score, order, href));
      }
    }
    cursor = tag_end + 1;
  }
  // 稳定排序：分数高的在前，同分保持文档顺序。
  scored.sort_by(|left, right| right.0.cmp(&left.0).then(left.1.cmp(&right.1)));
  let mut out: Vec<String> = Vec::new();
  for (_, _, href) in scored {
    if out.iter().any(|existing| existing == &href) {
      continue;
    }
    out.push(href);
    if out.len() >= PAGE_ICON_MAX_CANDIDATES {
      break;
    }
  }
  out
}

fn resolve_icon_url(base: &str, href: &str) -> Option<String> {
  let trimmed = href.trim();
  if trimmed.is_empty() || trimmed.starts_with('#') {
    return None;
  }
  let lowered = trimmed.to_ascii_lowercase();
  if lowered.starts_with("javascript:") || lowered.starts_with("blob:") {
    return None;
  }
  let base = reqwest::Url::parse(base).ok()?;
  base.join(trimmed).ok().map(|url| url.to_string())
}

/// v163：页面没声明图标时，按实际路径补几个常见位置。
/// `/proj/favicon.ico`（相对当前目录）排在 `/favicon.ico`（站点根）前面。
fn page_fallback_icon_urls(final_url: &str) -> Vec<String> {
  let Ok(base) = reqwest::Url::parse(final_url) else { return Vec::new(); };
  let mut out: Vec<String> = Vec::new();
  for name in ["favicon.ico", "favicon.png", "apple-touch-icon.png"] {
    for target in [base.join(name).ok(), base.join(&format!("/{}", name)).ok()] {
      if let Some(url) = target {
        let text = url.to_string();
        if !out.iter().any(|existing| existing == &text) {
          out.push(text);
        }
      }
    }
  }
  out
}

fn decode_percent_escapes(value: &str) -> Vec<u8> {
  let bytes = value.as_bytes();
  let mut out = Vec::with_capacity(bytes.len());
  let mut index = 0;
  while index < bytes.len() {
    if bytes[index] == b'%' {
      if let Some(hex) = value.get(index + 1..index + 3) {
        if let Ok(byte) = u8::from_str_radix(hex, 16) {
          out.push(byte);
          index += 3;
          continue;
        }
      }
    }
    out.push(bytes[index]);
    index += 1;
  }
  out
}

/// v163：`data:image/png;base64,...` 形式的图标直接解码，不用再发一次请求。
fn decode_data_icon_url(value: &str) -> Option<(Vec<u8>, String)> {
  let lowered = value.to_ascii_lowercase();
  let rest = lowered
    .strip_prefix("data:")
    .and_then(|_| value.get(5..))?;
  let (meta, payload) = rest.split_once(',')?;
  let mime = meta.split(';').next().unwrap_or("").trim();
  let mime = if mime.is_empty() { "image/png".to_string() } else { mime.to_string() };
  let bytes = if meta.to_ascii_lowercase().contains(";base64") {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.decode(payload.trim()).ok()?
  } else {
    decode_percent_escapes(payload)
  };
  (bytes.len() >= 32).then_some((bytes, mime))
}

/// v163：抓页面本身，取它自己声明的图标。
///
/// 这是「网站有专门图标时就用专门图标」的正解：`<link rel="icon">` 指向的通常是项目
/// 自己的 logo（例如 `./assets/whale-girl-logo-dynamic.png`），而按域名查的第三方服务
/// 只会给平台通用图标（`github.io` → GitHub 图标）。
fn fetch_page_declared_icon(normalized: &str) -> Result<(Vec<u8>, String), String> {
  let client = http_client()?;
  let mut response = client
    .get(normalized)
    .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YueLauncher/0.1")
    .header(ACCEPT, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
    .header(RANGE, format!("bytes=0-{}", MAX_TITLE_HTML_BYTES - 1))
    .send()
    .map_err(|error| error.to_string())?
    .error_for_status()
    .map_err(|error| error.to_string())?;
  let final_url = response.url().to_string();
  let content_type = response
    .headers()
    .get(CONTENT_TYPE)
    .and_then(|value| value.to_str().ok())
    .unwrap_or("")
    .to_string();
  let lowered = content_type.to_ascii_lowercase();
  if lowered.starts_with("image/") {
    // 拖进来的是图片直链，它本身就是图标。
    let mut bytes = Vec::new();
    response
      .by_ref()
      .take((MAX_FAVICON_BYTES + 1) as u64)
      .read_to_end(&mut bytes)
      .map_err(|error| error.to_string())?;
    if bytes.len() < 32 || bytes.len() > MAX_FAVICON_BYTES {
      return Err("图标内容大小异常".to_string());
    }
    return Ok((bytes, content_type));
  }
  if lowered.starts_with("video/") || lowered.starts_with("audio/") || lowered.contains("application/pdf") {
    return Err("该网址不是网页".to_string());
  }

  let mut html_bytes = Vec::new();
  response
    .by_ref()
    .take(MAX_TITLE_HTML_BYTES as u64)
    .read_to_end(&mut html_bytes)
    .map_err(|error| error.to_string())?;
  let html = String::from_utf8_lossy(&html_bytes);
  let mut last_error = "页面没有声明图标".to_string();

  for href in collect_page_icon_candidates(&html) {
    if href.to_ascii_lowercase().starts_with("data:") {
      if let Some((bytes, mime)) = decode_data_icon_url(&href) {
        return Ok((bytes, mime));
      }
      last_error = "页面内联图标无法解码".to_string();
      continue;
    }
    let Some(target) = resolve_icon_url(&final_url, &href) else {
      last_error = format!("图标地址无法解析：{}", href);
      continue;
    };
    match fetch_favicon_candidate(&target, false) {
      Ok(pair) => return Ok(pair),
      Err(error) => last_error = format!("{} ({})", error, target),
    }
  }

  for target in page_fallback_icon_urls(&final_url) {
    if let Ok(pair) = fetch_favicon_candidate(&target, false) {
      return Ok(pair);
    }
  }
  Err(last_error)
}

fn page_icon_misses() -> &'static Mutex<HashMap<String, u64>> {
  PAGE_ICON_MISS.get_or_init(Default::default)
}

fn page_icon_recently_missed(url: &str) -> bool {
  let now = now_ms();
  let ttl = PAGE_ICON_MISS_TTL.as_millis() as u64;
  let mut misses = page_icon_misses().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  match misses.get(url).copied() {
    Some(at) if now.saturating_sub(at) <= ttl => true,
    Some(_) => {
      misses.remove(url);
      false
    }
    None => false,
  }
}

fn mark_page_icon_miss(url: &str) {
  let now = now_ms();
  let ttl = PAGE_ICON_MISS_TTL.as_millis() as u64;
  let mut misses = page_icon_misses().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  misses.insert(url.to_string(), now);
  misses.retain(|_, at| now.saturating_sub(*at) <= ttl);
  if misses.len() > PAGE_ICON_MISS_MAX_ENTRIES {
    let mut stamps: Vec<u64> = misses.values().copied().collect();
    stamps.sort_unstable_by(|a, b| b.cmp(a));
    let cutoff = stamps[PAGE_ICON_MISS_MAX_ENTRIES - 1];
    misses.retain(|_, at| *at >= cutoff);
  }
}

fn clear_page_icon_miss(url: &str) {
  let mut misses = page_icon_misses().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  misses.remove(url);
}

fn favicon_extension(content_type: &str, candidate: &str) -> &'static str {
  let lowered = content_type.to_ascii_lowercase();
  if lowered.contains("svg") { "svg" }
  else if lowered.contains("x-icon") || lowered.contains("image/vnd.microsoft.icon") || candidate.to_ascii_lowercase().contains(".ico") { "ico" }
  else if lowered.contains("webp") { "webp" }
  else if lowered.contains("jpeg") || lowered.contains("jpg") { "jpg" }
  else if lowered.contains("gif") { "gif" }
  else { "png" }
}

fn fetch_favicon_candidate(candidate: &str, force_refresh: bool) -> Result<(Vec<u8>, String), String> {
  let client = http_client()?;
  let mut request = client
    .get(candidate)
    .header(USER_AGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) YueLauncher/0.1")
    .header(ACCEPT, "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.5");
  if force_refresh {
    request = request.header(CACHE_CONTROL, "no-cache");
  }
  let mut response = request
    .send()
    .map_err(|error| error.to_string())?
    .error_for_status()
    .map_err(|error| error.to_string())?;
  let content_type = response
    .headers()
    .get(CONTENT_TYPE)
    .and_then(|value| value.to_str().ok())
    .unwrap_or("")
    .to_string();
  if content_type.to_ascii_lowercase().contains("text/html") {
    return Err("返回内容不是图标".to_string());
  }
  let mut bytes = Vec::new();
  response
    .by_ref()
    .take((MAX_FAVICON_BYTES + 1) as u64)
    .read_to_end(&mut bytes)
    .map_err(|error| error.to_string())?;
  if bytes.len() < 32 {
    return Err("图标内容过小".to_string());
  }
  if bytes.len() > MAX_FAVICON_BYTES {
    return Err("图标内容过大".to_string());
  }
  Ok((bytes, content_type))
}

fn fetch_website_favicon_blocking(url: String, provider_id: Option<String>, fallback: Option<bool>, force_refresh: Option<bool>) -> Result<String, String> {
  let normalized = normalize_url(&url)?;
  let host = host_from_url(&normalized);
  if host.is_empty() {
    return Err("无法解析网址域名".to_string());
  }
  let dir = launcher_cache_dir();
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  let cache_domain = favicon_cache_domain(&host);
  let page_prefix = page_icon_prefix(&normalized);
  let force_refresh = force_refresh.unwrap_or(false);
  let fallback = fallback.unwrap_or(true);
  let selected_provider = provider_id.clone().unwrap_or_else(|| "auto".to_string());
  let providers = favicon_provider_order(provider_id.as_deref(), fallback);
  let page_enabled = providers.contains(&"page");
  if !force_refresh && page_enabled {
    // v163：页面级缓存最精确 —— 同一主机下的不同路径各有各的图标。
    if let Some(cached) = cached_icon_with_prefix(&dir, &page_prefix) {
      return Ok(cached.to_string_lossy().to_string());
    }
    // 注意：这里不再先查域名级缓存。旧版本按域名猜的图标（github.io → GitHub）
    // 会直接短路掉页面自带的图标，正是「有专门图标却显示平台图标」的成因。
  }

  let key = format!("{}|{}|{}|{}", normalized, selected_provider, fallback, force_refresh);
  dedupe_string(key, FAVICON_IN_FLIGHT.get_or_init(Default::default), move || {
    let domain_prefix = format!("site_{}", safe_file_part(&cache_domain));
    let mut last_error = "未获取到网站图标".to_string();
    let mut domain_cache_checked = false;

    for provider in providers {
      if provider == "page" {
        if !force_refresh && page_icon_recently_missed(&normalized) {
          continue;
        }
        match fetch_page_declared_icon(&normalized) {
          Ok((bytes, content_type)) => {
            let output = dir.join(&page_prefix).with_extension(favicon_extension(&content_type, &normalized));
            if let Err(error) = fs::write(&output, bytes) {
              last_error = error.to_string();
              continue;
            }
            remove_icon_variants(&dir, &page_prefix, Some(&output));
            clear_page_icon_miss(&normalized);
            return Ok(output.to_string_lossy().to_string());
          }
          Err(error) => {
            last_error = error;
            mark_page_icon_miss(&normalized);
          }
        }
        continue;
      }

      // 域名级缓存只在进入「按域名 / 直连」阶段时才复用。
      if !force_refresh && !domain_cache_checked {
        domain_cache_checked = true;
        if let Some(cached) = cached_favicon_for_domain(&dir, &cache_domain) {
          return Ok(cached.to_string_lossy().to_string());
        }
      }

      let candidate = append_refresh_token(favicon_candidate_url(provider, &cache_domain, &normalized), force_refresh);
      match fetch_favicon_candidate(&candidate, force_refresh) {
        Ok((bytes, content_type)) => {
          let output = dir.join(&domain_prefix).with_extension(favicon_extension(&content_type, &candidate));
          if let Err(error) = fs::write(&output, bytes) {
            last_error = error.to_string();
            continue;
          }
          remove_canonical_favicon_variants(&dir, &cache_domain, Some(&output));
          return Ok(output.to_string_lossy().to_string());
        }
        Err(error) => last_error = error,
      }
    }
    Err(last_error)
  })
}

#[tauri::command]
pub async fn fetch_website_favicon(url: String, provider_id: Option<String>, fallback: Option<bool>, force_refresh: Option<bool>) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || fetch_website_favicon_blocking(url, provider_id, fallback, force_refresh))
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn fetch_website_title(url: String) -> Result<String, String> {
  tauri::async_runtime::spawn_blocking(move || fetch_website_title_blocking(url))
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn test_favicon_sources(domain: String) -> Result<Vec<FaviconTestResult>, String> {
  tauri::async_runtime::spawn_blocking(move || {
    // v163：测速保留原始路径 —— `treapgogo.github.io/deepseek-whale-girl/` 与
    // `treapgogo.github.io` 的图标完全不同，页面图标源必须按完整网址测。
    let raw_url = normalize_url(&domain).unwrap_or_else(|_| format!("https://{}", domain.trim()));
    let host = host_from_url(&raw_url);
    let clean_host = if host.is_empty() {
      domain.trim().trim_start_matches("http://").trim_start_matches("https://").split('/').next().unwrap_or("").to_ascii_lowercase()
    } else {
      host
    };
    if clean_host.is_empty() {
      return Err("请输入要测试的域名".to_string());
    }
    let scan_host = favicon_cache_domain(&clean_host);
    let mut results = Vec::new();
    for provider in favicon_provider_order(Some("auto"), true) {
      let candidate = favicon_candidate_url(provider, &scan_host, &raw_url);
      let start = Instant::now();
      let outcome = if provider == "page" {
        fetch_page_declared_icon(&raw_url)
      } else {
        fetch_favicon_candidate(&candidate, true)
      };
      let elapsed_ms = start.elapsed().as_millis();
      let success = outcome.is_ok();
      let (name, group) = favicon_provider_meta(provider);
      results.push(FaviconTestResult {
        provider_id: provider.to_string(),
        provider_name: name.to_string(),
        group: group.to_string(),
        success,
        elapsed_ms,
        url: Some(candidate),
        error: outcome.err(),
      });
    }
    results.sort_by(|a, b| b.success.cmp(&a.success).then(a.elapsed_ms.cmp(&b.elapsed_ms)));
    Ok(results)
  })
  .await
  .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
  use super::*;

  fn entry(title: &str, saved_at_ms: u64) -> TitleCacheEntry {
    TitleCacheEntry { title: title.to_string(), saved_at_ms }
  }

  #[test]
  fn prune_title_cache_drops_expired_and_blank_entries() {
    let now = TITLE_CACHE_TTL.as_millis() as u64 * 3;
    let mut cache = HashMap::new();
    cache.insert("fresh".to_string(), entry("Fresh", now - 1000));
    cache.insert("old".to_string(), entry("Old", now - TITLE_CACHE_TTL.as_millis() as u64 - 1));
    cache.insert("blank".to_string(), entry("   ", now));
    let pruned = prune_title_cache(&cache, now);
    assert_eq!(pruned.len(), 1);
    assert!(pruned.contains_key("fresh"));
  }

  #[test]
  fn prune_title_cache_keeps_newest_when_over_capacity() {
    let now = 10_000_000;
    let mut cache = HashMap::new();
    for i in 0..(TITLE_CACHE_MAX_ENTRIES + 10) {
      cache.insert(format!("u{i}"), entry("t", now - 100_000 + i as u64));
    }
    let pruned = prune_title_cache(&cache, now);
    assert_eq!(pruned.len(), TITLE_CACHE_MAX_ENTRIES);
    assert!(!pruned.contains_key("u0"));
    assert!(pruned.contains_key(&format!("u{}", TITLE_CACHE_MAX_ENTRIES + 9)));
  }

  #[test]
  fn prune_title_failures_drops_expired_and_caps_size() {
    let ttl = TITLE_FAILURE_TTL.as_millis() as u64;
    let now = ttl * 10;
    let mut failures = HashMap::new();
    failures.insert("expired".to_string(), now - ttl - 1);
    for i in 0..(TITLE_FAILURE_MAX_ENTRIES + 20) {
      failures.insert(format!("f{i}"), now - 1000 + i as u64);
    }
    prune_title_failures(&mut failures, now);
    assert!(!failures.contains_key("expired"));
    assert_eq!(failures.len(), TITLE_FAILURE_MAX_ENTRIES);
    assert!(failures.contains_key(&format!("f{}", TITLE_FAILURE_MAX_ENTRIES + 19)));
  }

  // ---- v163：网站自带图标优先 ----

  #[test]
  fn hosted_platform_hosts_keep_their_subdomain() {
    // 每个 *.github.io 子域是独立站点；压成 github.io 只能拿到 GitHub 自己的图标。
    assert_eq!(favicon_cache_domain("treapgogo.github.io"), "treapgogo.github.io");
    assert_eq!(favicon_cache_domain("momoqiqi.github.io"), "momoqiqi.github.io");
    assert_eq!(favicon_cache_domain("x.netlify.app"), "x.netlify.app");
    assert_eq!(favicon_cache_domain("raw.githubusercontent.com"), "raw.githubusercontent.com");
    // 普通站点仍然收敛到主域，共用一份缓存。
    assert_eq!(favicon_cache_domain("www.example.com"), "example.com");
    assert_eq!(favicon_cache_domain("blog.example.com"), "example.com");
    assert_eq!(favicon_cache_domain("shop.example.co.uk"), "example.co.uk");
  }

  #[test]
  fn page_icon_candidates_prefer_declared_project_logo() {
    // 鲸鱼娘资产库真实页头的写法：项目自己的 logo，相对路径。
    let html = r#"<html><head>
      <title>鲸鱼娘开源资产库</title>
      <link rel="icon" type="image/png" sizes="256x256" href="./assets/whale-girl-logo-dynamic.png" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png">
      <meta property="og:image" content="https://treapgogo.github.io/deepseek-whale-girl/preview.png">
    </head></html>"#;
    let candidates = collect_page_icon_candidates(html);
    assert_eq!(candidates[0], "./assets/whale-girl-logo-dynamic.png");
    assert!(candidates.contains(&"/apple-touch-icon.png".to_string()));
    assert!(candidates.contains(&"https://treapgogo.github.io/deepseek-whale-girl/preview.png".to_string()));
  }

  #[test]
  fn icon_hrefs_resolve_against_the_page_url() {
    let base = "https://treapgogo.github.io/deepseek-whale-girl/";
    assert_eq!(
      resolve_icon_url(base, "./assets/whale-girl-logo-dynamic.png").as_deref(),
      Some("https://treapgogo.github.io/deepseek-whale-girl/assets/whale-girl-logo-dynamic.png")
    );
    assert_eq!(resolve_icon_url(base, "/favicon.ico").as_deref(), Some("https://treapgogo.github.io/favicon.ico"));
    assert_eq!(resolve_icon_url(base, "#frag"), None);
    assert_eq!(resolve_icon_url(base, "javascript:void(0)"), None);
  }

  #[test]
  fn page_icon_prefix_separates_paths_but_ignores_query() {
    let whale = page_icon_prefix("https://treapgogo.github.io/deepseek-whale-girl/");
    let other = page_icon_prefix("https://treapgogo.github.io/some-other-project/");
    let same_with_query = page_icon_prefix("https://treapgogo.github.io/deepseek-whale-girl/?from=bookmark");
    assert_ne!(whale, other);
    assert_eq!(whale, same_with_query);
    assert!(whale.starts_with("page_"));
  }

  #[test]
  fn auto_provider_order_tries_the_page_icon_first() {
    assert_eq!(favicon_provider_order(None, true)[0], "page");
    assert_eq!(favicon_provider_order(Some("auto"), true)[0], "page");
    // 显式选了来源又不兜底时尊重用户选择，不去抓页面。
    assert_eq!(favicon_provider_order(Some("quicker"), false), vec!["quicker"]);
    assert!(favicon_provider_order(Some("quicker"), true).contains(&"page"));
  }

  #[test]
  fn tag_attributes_handle_quotes_and_case() {
    let attrs = parse_tag_attributes("<LINK REL='shortcut icon' HREF=favicon.ico sizes=32x32");
    let get = |name: &str| attrs.iter().find(|(key, _)| key == name).map(|(_, value)| value.clone());
    assert_eq!(get("rel").as_deref(), Some("shortcut icon"));
    assert_eq!(get("href").as_deref(), Some("favicon.ico"));
    assert_eq!(get("sizes").as_deref(), Some("32x32"));
  }

  #[test]
  fn inline_data_icons_are_decoded() {
    let png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/wH+2n0AAAAASUVORK5CYII=";
    let (bytes, mime) = decode_data_icon_url(&format!("data:image/png;base64,{}", png)).expect("inline png");
    assert_eq!(mime, "image/png");
    assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
    // 太短的内容不当图标用。
    assert!(decode_data_icon_url("data:image/png;base64,AAAA").is_none());
  }

  #[test]
  fn page_icon_miss_is_remembered_and_cleared() {
    let url = "https://example.com/remembered-miss/";
    assert!(!page_icon_recently_missed(url));
    mark_page_icon_miss(url);
    assert!(page_icon_recently_missed(url));
    clear_page_icon_miss(url);
    assert!(!page_icon_recently_missed(url));
  }
}
