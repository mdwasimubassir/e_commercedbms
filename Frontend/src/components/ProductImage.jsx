import { useState } from "react";

export default function ProductImage({ src, alt, large = false }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={large ? "product-image fallback large" : "product-image fallback"} aria-label="Product image unavailable">No image</div>;

  return <img className={large ? "product-image large" : "product-image"} src={src} alt={alt} onError={() => setFailed(true)} />;
}
