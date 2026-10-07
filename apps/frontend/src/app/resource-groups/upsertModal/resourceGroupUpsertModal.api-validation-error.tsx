export // Define a more specific type for the expected error structure from the API
interface ApiValidationError {
  errors?: {
    [key: string]: string[];
  };
  message?: string; // General error message field
}
