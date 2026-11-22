import { copyVendor } from './copy-vendor.mjs';

await copyVendor('dist/ui');
console.log('copied vendor -> dist/ui/vendor');
