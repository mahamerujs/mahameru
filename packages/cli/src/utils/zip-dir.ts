import AdmZip from 'adm-zip';
import { basename } from 'node:path';

export const extractZip = (sourceZipPath: string, targetDir: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip(sourceZipPath);

      zip.extractAllToAsync(targetDir, true, undefined, (error) => {
        if (error) {
          reject(new Error(`Extraction failed: ${error.message}`));
        } else {
          resolve(`Successfully extracted to ${targetDir}`);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
};

export const createZip = (
  folderPath: string,
  outputZipPath: string,
  withDir: boolean,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const zip = new AdmZip();

      if (withDir) {
        const baseDirName = basename(folderPath);
        zip.addLocalFolder(folderPath, baseDirName);
      } else {
        zip.addLocalFolder(folderPath);
      }

      zip.writeZip(outputZipPath, (error) => {
        if (error) {
          reject(new Error(`Zipping failed: ${error}`));
        } else {
          resolve(`Successfully created zip at ${outputZipPath}`);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
};
