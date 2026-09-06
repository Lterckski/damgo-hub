/* eslint-disable @next/next/no-img-element -- This fixture replaces the Next image loader outside Next.js. */
import React from "react";
export default function Image(props) {
  const imageProps = { ...props };
  delete imageProps.priority;
  delete imageProps.fill;
  delete imageProps.unoptimized;
  return <img {...imageProps} alt={imageProps.alt ?? ""} />;
}
