const downloadDomains = ['drive.google.com', 'docs.google.com', 'disk.yandex.ru', 'yadi.sk'];

export function isDownloadLink(url) {
  if (!url) {
    return false;
  }

  try {
    const { hostname } = new URL(url);
    return downloadDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

export function getPsdDownloadUrl(item) {
  if (item?.type !== 'video') {
    return '';
  }

  return [item.videoUrl, item.channelUrl].find(isDownloadLink) || '';
}

export function isPsdDownloadItem(item) {
  return Boolean(getPsdDownloadUrl(item));
}
