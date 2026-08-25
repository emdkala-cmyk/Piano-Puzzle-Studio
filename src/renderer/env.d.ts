export {};

declare global {
  interface Window {
    pianoPuzzle?: {
      getAppInfo: () => Promise<{ name: string; version: string }>;
      chooseAsset: (type: "image" | "midi" | "audio") => Promise<{
        filePath: string; fileName: string; fileSize: number; mimeType: string; dataBase64: string;
      } | null>;
      // 🧪 TEST: Read file by absolute path (DELETE AFTER TESTING)
      readAssetByPath: (filePath: string) => Promise<{
        filePath: string; fileName: string; fileSize: number; mimeType: string; dataBase64: string;
      } | null>;
    };
  }
}
