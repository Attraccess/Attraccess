# Use flows as the Matter device-resource relationship

Matter Devices remain independent installation-level devices and are associated with resources only when referenced by resource flow nodes. Attraccess will not add a device-to-resource foreign key: one device may participate in several resources, and flows remain the canonical representation of when device observations and commands affect a resource.
