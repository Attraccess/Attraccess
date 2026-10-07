import '@testing-library/jest-dom/vitest';
export const originalScrollTo = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
