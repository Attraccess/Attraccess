export const mockRbacService = {
  getEffectivePermissions: jest.fn().mockResolvedValue(new Set<string>()),
};
