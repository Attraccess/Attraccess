import { prepareZXingModule } from 'barcode-detector/ponyfill';
import readerWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// Keep camera scanning available on local networks without fetching the decoder from a CDN.
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? readerWasmUrl : prefix + path),
  },
});
