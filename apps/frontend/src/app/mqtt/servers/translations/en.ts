const translations = {
  title: 'MQTT Servers',
  addNewServer: 'Add New Server',
  errorLoading: 'Error loading MQTT servers.',
  noServersConfigured:
    'No MQTT servers configured yet. Click "Add New Server" to create one.',

  // Table headers
  name: 'NAME',
  host: 'HOST',
  port: 'PORT',
  tls: 'TLS',
  authentication: 'AUTHENTICATION',
  actions: 'ACTIONS',

  // TLS status
  enabled: 'Enabled',
  disabled: 'Disabled',

  // Authentication status
  anonymous: 'Anonymous',

  // Tooltips
  testConnection: 'Test Connection',
  editServer: 'Edit Server',
  deleteServer: 'Delete Server',

  // Modal
  editMqttServer: 'Edit MQTT Server',
  addNewMqttServer: 'Add New MQTT Server',

  // Form labels
  nameLabel: 'Name',
  namePlaceholder: 'My MQTT Server',
  hostLabel: 'Host',
  hostPlaceholder: 'mqtt.example.com',
  portLabel: 'Port',
  portPlaceholder: '1883',
  clientIdLabel: 'Client ID (Optional)',
  clientIdPlaceholder: 'attraccess-client',
  usernameLabel: 'Username (Optional)',
  usernamePlaceholder: 'mqtt_user',
  passwordLabel: 'Password (Optional)',
  passwordPlaceholder: '••••••••',
  useTls: 'Use TLS/SSL',

  // Buttons
  cancel: 'Cancel',
  update: 'Update Server',
  create: 'Create Server',

  // Confirmation
  deleteConfirmation: 'Are you sure you want to delete this MQTT server?',

  // Toast messages
  serverDeleted: 'MQTT Server Deleted',
  serverDeletedDesc: 'The MQTT server has been successfully deleted.',
  serverUpdated: 'MQTT Server Updated',
  serverUpdatedDesc: 'The MQTT server has been successfully updated.',
  serverCreated: 'MQTT Server Created',
  serverCreatedDesc: 'A new MQTT server has been successfully created.',
  connectionSuccessful: 'Connection Successful',
  connectionSuccessfulDesc: 'Connected to MQTT server successfully',
  connectionFailed: 'Connection Failed',
  connectionCheckError: 'Connection Check Error',
  invalidResponseFormat: 'Received invalid response format from server',
  connectionTestError: 'Connection Test Error',
  errorGeneric: 'Error',
  failedToDelete: 'Failed to delete MQTT server.',
  failedToUpdate: 'Failed to update MQTT server.',
  failedToCreate: 'Failed to create MQTT server.',
  failedToConnect: 'Failed to connect to MQTT server',
};

export default { default: translations };
