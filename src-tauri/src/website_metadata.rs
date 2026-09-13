use reqwest::blocking::{Client, Response};
use reqwest::header::{ACCEPT, CACHE_CONTROL, CONTENT_TYPE, RANGE, USER_AGENT};
use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  env, fs,
  io::Read,
  path::{Path, PathBuf},
  sync::{Arc, Condvar, Mutex, OnceLock},
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const HTTP_TIMEOUT: Duration = Duration::from_secs(8);
const TITLE_CACHE_TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const MAX_TITLE_HTML_BYTES: u64 = 512 * 1024;
const MAX_FAVICON_BYTES: usize = 4 * 1024 * 1024;

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

fn http_client() -> Result<&'static Client, String> {
  if let Some(client) = HTTP_CLIENT.get() {
    return Ok(client);
  }
  let client = Client::builder()
    .connect_timeout(Duration::from_secs(4))
    .timeout(HTTP_TIMEOUT)
    .redirect(reqwest::redirect::Policy::limited(5))
    .pool_idle_timeout(Duration::from_secs(90))
    .pool_max_idle_per_host(8)
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

fn persist_title_cache(cache: &HashMap<String, TitleCacheEntry>) {
  let path = title_cache_path();
  let Some(parent) = path.parent() else { return; };
  if fs::create_dir_all(parent).is_err() {
    return;
  }
  let Ok(raw) = serde_json::to_vec(cache) else { return; };
  let temp = path.with_extension("json.tmp");
  if fs::write(&temp, raw).is_err() {
    return;
  }
  if fs::rename(&temp, &path).is_err() {
    let _ = fs::remove_file(&path);
    let _ = fs::rename(&temp, &path);
  }
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
  candidates.sort_by(|left, right| right.0.cmp(&left.0));
  candidates.into_iter().map(|(_, path)| path).next()
}

fn remove_canonical_favicon_variants(dir: &Path, cache_domain: &str, except: Option<&Path>) {
  let canonical_prefix = format!("site_{}", safe_file_part(cache_domain));
  let Ok(entries) = fs::read_dir(dir) else { return; };
  for entry in entries.flatten() {
    let path = entry.path();
    if except.is_some_and(|keep| keep == path.as_path()) {
      continue;
    }
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or_default();
    if stem == canonical_prefix && is_favicon_file(&path) {
      let _ = fs::remove_file(path);
    }
  }
}

fn favicon_provider_meta(id: &str) -> (&'static str, &'static str) {
  match id {
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
  const DEFAULTS: [&str; 10] = ["quicker", "faviconIm", "iowen", "google", "duckduckgo", "clearbit", "iconHorse", "faviconKit", "yandex", "direct"];
  let selected = provider_id.unwrap_or("auto");
  if selected == "auto" || selected.trim().is_empty() {
    return DEFAULTS.to_vec();
  }
  let selected_static = match selected {
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

fn title_from_html(html: &str) -> Option<String> {
  let lower = html.to_ascii_lowercase();
  let start = lower.find("<title")?;
  let open_end = lower[start..].find('>')? + start + 1;
  let close = lower[open_end..].find("</title>")? + open_end;
  let decoded = html_escape::decode_html_entities(&html[open_end..close]);
  let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
  let title = collapsed.chars().take(120).collect::<String>();
  (!title.is_empty()).then_some(title)
}

fn read_limited_text(mut response: Response) -> Result<String, String> {
  let mut bytes = Vec::new();
  response
    .by_ref()
    .take(MAX_TITLE_HTML_BYTES)
    .read_to_end(&mut bytes)
    .map_err(|error| error.to_string())?;
  Ok(String::from_utf8_lossy(&bytes).into_owned())
}

fn fetch_title_http(url: &str) -> Result<String, String> {
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
  let html = read_limited_text(response)?;
  title_from_html(&html).ok_or_else(|| "未获取到网页标题".to_string())
}

fn get_cached_title(url: &str) -> Option<String> {
  let now = now_ms();
  let max_age = TITLE_CACHE_TTL.as_millis() as u64;
  let mut cache = title_cache().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  let entry = cache.get(url)?.clone();
  if now.saturating_sub(entry.saved_at_ms) > max_age {
    cache.remove(url);
    persist_title_cache(&cache);
    return None;
  }
  Some(entry.title)
}

fn store_cached_title(url: String, title: String) {
  let mut cache = title_cache().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
  cache.insert(url, TitleCacheEntry { title, saved_at_ms: now_ms() });
  persist_title_cache(&cache);
}

fn fetch_website_title_blocking(url: String) -> Result<String, String> {
  let normalized = normalize_url(&url)?;
  if let Some(title) = get_cached_title(&normalized) {
    return Ok(title);
  }
  let key = normalized.clone();
  dedupe_string(key.clone(), TITLE_IN_FLIGHT.get_or_init(Default::default), move || {
    if let Some(title) = get_cached_title(&key) {
      return Ok(title);
    }
    let title = fetch_title_http(&key)?;
    store_cached_title(key, title.clone());
    Ok(title)
  })
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
  let force_refresh = force_refresh.unwrap_or(false);
  if !force_refresh {
    if let Some(cached) = cached_favicon_for_domain(&dir, &cache_domain) {
      return Ok(cached.to_string_lossy().to_string());
    }
  }

  let fallback = fallback.unwrap_or(true);
  let selected_provider = provider_id.clone().unwrap_or_else(|| "auto".to_string());
  let key = format!("{}|{}|{}|{}", cache_domain, selected_provider, fallback, force_refresh);
  dedupe_string(key, FAVICON_IN_FLIGHT.get_or_init(Default::default), move || {
    if !force_refresh {
      if let Some(cached) = cached_favicon_for_domain(&dir, &cache_domain) {
        return Ok(cached.to_string_lossy().to_string());
      }
    }

    let prefix = dir.join(format!("site_{}", safe_file_part(&cache_domain)));
    let providers = favicon_provider_order(provider_id.as_deref(), fallback);
    let mut last_error = "未获取到网站图标".to_string();
    for provider in providers {
      let candidate = append_refresh_token(favicon_candidate_url(provider, &cache_domain, &normalized), force_refresh);
      match fetch_favicon_candidate(&candidate, force_refresh) {
        Ok((bytes, content_type)) => {
          let output = prefix.with_extension(favicon_extension(&content_type, &candidate));
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
    let host = host_from_url(&normalize_url(&domain).unwrap_or_else(|_| format!("https://{}", domain.trim())));
    let clean_host = if host.is_empty() {
      domain.trim().trim_start_matches("http://").trim_start_matches("https://").split('/').next().unwrap_or("").to_ascii_lowercase()
    } else {
      host
    };
    if clean_host.is_empty() {
      return Err("请输入要测试的域名".to_string());
    }
    let raw_url = format!("https://{}", clean_host);
    let mut results = Vec::new();
    for provider in favicon_provider_order(Some("auto"), true) {
      let candidate = favicon_candidate_url(provider, &clean_host, &raw_url);
      let start = Instant::now();
      let outcome = fetch_favicon_candidate(&candidate, true);
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
