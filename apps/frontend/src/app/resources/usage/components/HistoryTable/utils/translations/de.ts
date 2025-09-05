export default {
  headers: {
    user: 'Benutzer',
    machine: {
      startTime: 'Startzeit',
      endTime: 'Endzeit',
      duration: 'Dauer',
    },
    door: {
      time: 'Zeit',
      action: 'Aktion',
    },
  },

  rows: {
    door: {
      action: {
        'door.lock': 'Abgeschlossen',
        'door.unlock': 'Aufgeschlossen',
        'door.unlatch': 'Falle geöffnet',
      },
    },
    machine: {
      inProgress: 'In Benutzung',
    },
  },

  noUsageHistory: 'Keine Nutzungshistorie für diese Ressource gefunden.',
  errorLoadingHistory: 'Fehler beim Laden der Nutzungshistorie. Bitte versuchen Sie es erneut.',
};
