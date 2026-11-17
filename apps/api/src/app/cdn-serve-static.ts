import { ServeStaticModuleOptions } from '@nestjs/serve-static';

// Excluding every path under the mount keeps serve-static's index.html fallback from
// answering requests for missing files: its 404 echoes the absolute path of the index file.
// serve-static matches excludes against the raw request target, so the absolute form
// (`GET http://host/cdn/...`, even with an empty host, which Express still routes to the mount)
// needs its own pattern.
// The CDN holds uploaded files only, never directory indexes. With `index` on, an absolute-form
// directory request with an empty host (`GET http:///cdn/`) reaches send without a path, which
// throws and answers 500.
export function cdnServeStaticOptions(rootPath: string, serveRoot: string): ServeStaticModuleOptions {
  return {
    rootPath,
    serveRoot,
    serveStaticOptions: { index: false },
    exclude: [`${serveRoot}/{*path}`, `{:scheme\\://{:authority}}${serveRoot}/{*path}`],
  };
}
