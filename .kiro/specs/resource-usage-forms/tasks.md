# Implementation Plan

- [x] 1. Create all database entities

  - Implement FormTemplate entity with proper TypeORM decorators
  - Implement FormField entity with relationship to FormTemplate
  - Implement ResourceFormAssignment entity with relationships to Resource and FormTemplate
  - Implement FormSubmission entity with relationships to FormTemplate, ResourceUsage, and User
  - Add proper field type validation, options handling, and ordering logic
  - Add proper indexes for performance optimization
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 2. Generate and run database migrations

  - Generate database migrations for all new entities
  - Run migrations to create the new tables
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 3. Implement backend services

- [ ] 3.1 Create FormTemplateService

  - Implement CRUD operations for form templates
  - Add Zod schemas for template validation and field type validation
  - Include field management within template operations
  - _Requirements: 1.6, 6.1_

- [ ] 3.2 Create FormAssignmentService

  - Implement service for managing template assignments to resources
  - Add support for multiple forms per action with ordering
  - Include bulk assignment functionality
  - _Requirements: 2.1, 2.2, 2.3_

- [ ] 4. Implement form template API endpoints
- [ ] 4.1 Create form template controller endpoints

  - Implement POST /form-templates for creating templates
  - Implement GET /form-templates for listing templates
  - Implement PUT /form-templates/:id for updating templates
  - Implement DELETE /form-templates/:id for deleting templates
  - _Requirements: 1.6_

- [ ] 4.2 Create form assignment controller endpoints

  - Implement POST /resources/:id/form-assignments for assigning templates
  - Implement GET /resources/:id/form-assignments for listing assignments
  - Implement DELETE /form-assignments/:id for removing assignments
  - Implement PUT /form-assignments/:id for updating assignment order
  - _Requirements: 2.1, 2.2, 2.4_

- [ ] 5. Implement form submission backend
- [ ] 5.1 Create FormSubmissionService

  - Create FormSubmissionService for storing and retrieving submissions
  - Add Zod schemas for form submission data validation
  - Include permission checks for viewing submissions
  - _Requirements: 3.6, 6.2_

- [ ] 5.2 Integrate form submissions with existing resource usage endpoints

  - Modify existing start/stop/takeover endpoints to accept optional "forms" property in payload
  - Update ResourceUsageService to validate and store form submissions during resource actions
  - Add form validation before allowing resource actions to proceed
  - Store form submissions linked to resource usage records
  - _Requirements: 3.1, 3.4, 3.5, 3.6_

- [ ] 5.3 Create form submission viewing endpoints

  - Implement GET /form-submissions/:usageId for viewing submissions by usage ID
  - Add permission checks for viewing other users' submissions
  - _Requirements: 4.1, 4.2, 5.1, 5.2_

- [ ] 6. Create form template builder UI
- [ ] 6.1 Implement basic template builder interface

  - Create TemplateBuilderEditor component with drag-and-drop
  - Implement FieldTypeSelector for adding different field types
  - Add FieldPropertiesPanel for configuring field settings
  - _Requirements: 1.1, 1.2, 1.3_

- [ ] 6.2 Add form preview and validation

  - Implement FormPreview component showing real-time preview
  - Add Zod schemas for client-side template configuration validation
  - Implement DragDropFieldList for reordering fields
  - _Requirements: 1.5_

- [ ] 6.3 Create template library and management

  - Implement TemplateLibrary for browsing existing templates
  - Add template creation, editing, and deletion functionality
  - Implement template search and filtering
  - _Requirements: 1.6_

- [ ] 7. Create form assignment management UI
- [ ] 7.1 Implement resource form assignment interface

  - Create ResourceFormAssignmentPanel for managing assignments
  - Add interface for selecting templates and action types
  - Implement assignment ordering for multiple forms per action
  - _Requirements: 2.1, 2.2, 2.4_

- [ ] 7.2 Add bulk assignment functionality

  - Implement BulkAssignmentTool for assigning to multiple resources
  - Add resource selection and filtering capabilities
  - Create AssignmentOverview showing current assignments
  - _Requirements: 2.1_

- [ ] 8. Implement dynamic form runtime
- [ ] 8.1 Create dynamic form rendering components

  - Implement DynamicForm component that renders forms from configuration
  - Create FormFieldRenderer for different field types (text, select, boolean, etc.)
  - Add proper form state management and validation
  - _Requirements: 3.2, 3.3_

- [ ] 7.2 Integrate forms with resource usage workflow

  - Modify resource usage buttons to check for required forms
  - Display forms in modal before executing resource actions
  - Collect form data and include in existing start/stop/takeover API calls as "forms" property
  - Handle multiple forms per action by collecting all form data into dictionary
  - _Requirements: 3.1, 3.4, 3.5_

- [ ] 7.3 Add form validation and error handling

  - Implement FormValidator using Zod schemas for client-side validation
  - Add proper error display for Zod validation failures
  - Create FormSubmissionHandler for API communication
  - _Requirements: 3.3, 3.5_

- [ ] 8. Implement form submission viewing
- [ ] 8.1 Add form submission indicators to usage history

  - Modify usage history table to show form submission indicators
  - Add "View Form" button for entries with submissions
  - Implement permission checks for viewing submissions
  - _Requirements: 4.1, 4.2, 5.1, 5.2_

- [ ] 8.2 Create form submission viewer components

  - Implement SubmissionModal for displaying form data
  - Create SubmissionDataDisplay for formatted data presentation
  - Add proper handling of different field types in display
  - _Requirements: 4.3, 5.3_

- [ ] 9. Add comprehensive testing
- [ ] 9.1 Write unit tests for backend services

  - Test FormTemplateService CRUD operations
  - Test FormAssignmentService functionality
  - Test FormSubmissionService with validation
  - Test integration with ResourceUsageService
  - _Requirements: All backend requirements_

- [ ] 9.2 Write unit tests for frontend components

  - Test form builder components and interactions
  - Test dynamic form rendering and validation
  - Test form submission viewing components
  - Test assignment management interfaces
  - _Requirements: All frontend requirements_

- [ ] 9.3 Write integration tests

  - Test complete form creation and assignment workflow
  - Test resource usage with form requirements
  - Test form submission and viewing permissions
  - Test multi-form workflows for single actions
  - _Requirements: All requirements_

- [ ] 10. Add API documentation and error handling
- [ ] 10.1 Update API documentation

  - Add Swagger documentation for all new endpoints
  - Document request/response schemas for forms
  - Add examples for form configurations and submissions
  - _Requirements: All API requirements_

- [ ] 10.2 Implement comprehensive error handling
  - Add proper error responses for all form operations
  - Implement graceful degradation when forms fail to load
  - Add retry mechanisms for failed form submissions
  - Create user-friendly error messages
  - _Requirements: All requirements_
