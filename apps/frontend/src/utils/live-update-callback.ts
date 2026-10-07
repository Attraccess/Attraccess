export function invokeLiveCallback(callback?: () => void): void {
  try {
    void Promise.resolve(callback?.()).catch((error) => {
      console.error('[Live updates] Consumer failed:', error);
    });
  } catch (error) {
    console.error('[Live updates] Consumer failed:', error);
  }
}
