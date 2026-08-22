export function BuildLabel() {
  return <small className="build-label" aria-label={`构建版本 ${__BUILD_VERSION__}`}>{__BUILD_VERSION__}</small>
}
