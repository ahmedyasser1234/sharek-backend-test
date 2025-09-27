import { existsSync, mkdirSync } from 'fs';
import { diskStorage } from 'multer';
import { extname } from 'path';

export function createCompanyStorage() {
  return diskStorage({
    destination: (req, file, cb) => {
      const companyId = (req as any).user?.companyId; 
      if (!companyId) {
        return cb(new Error('Company ID is required for uploads'), '');
      }

      const uploadPath = `./uploads/companies/${companyId}`;
      if (!existsSync(uploadPath)) {
        mkdirSync(uploadPath, { recursive: true });
      }

      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = extname(file.originalname);
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  });
}
