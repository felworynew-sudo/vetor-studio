import { useEffect, useState } from 'react';

function ImageWithFallback({
  src,
  fallback,
  alt,
  className = '',
  srcSet,
  sizes,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'auto',
  ...rest
}) {
  const [currentSource, setCurrentSource] = useState(src);

  useEffect(() => {
    setCurrentSource(src);
  }, [src]);

  return (
    <img
      src={currentSource}
      srcSet={currentSource === src ? srcSet : undefined}
      sizes={currentSource === src ? sizes : undefined}
      alt={alt}
      loading={loading}
      decoding={decoding}
      fetchpriority={fetchPriority}
      className={className}
      {...rest}
      onError={() => {
        if (currentSource !== fallback) {
          setCurrentSource(fallback);
        }
      }}
    />
  );
}

export default ImageWithFallback;
