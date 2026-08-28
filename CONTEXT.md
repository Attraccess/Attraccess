# Attraccess

Attraccess controls access to resources and coordinates the devices that observe or actuate them. It remains the authority for identity, permission, safety policy, and audit regardless of the device protocol in use.

## Language

**Matter Device**:
A commissioned device that Attraccess can observe or control through its Matter fabric.
_Avoid_: Access device, smart-home device

**Matter Endpoint**:
One independently addressable function of a Matter Device, including a function represented through a Matter bridge.
_Avoid_: Child device, channel

**Unclaimed Matter Device**:
A device present in the Attraccess fabric but not yet associated with a core registry record; it is quarantined from flows until an administrator claims or removes it.
_Avoid_: Discovered device

**Detached Matter Device**:
A core registry record whose corresponding device is no longer present in the Attraccess fabric.
_Avoid_: Deleted device, offline device

**Matter Sidecar**:
The separately deployed protocol component that participates in the Attraccess Matter fabric on behalf of Attraccess core.
_Avoid_: Matter hub, Matter plugin

**Commissioning Device**:
The customer's browser-capable phone or computer used to introduce an uncommissioned Matter device to Attraccess.
_Avoid_: Matter controller, Bluetooth proxy

**Commissioning Relay**:
The short-lived connection through which a Commissioning Device carries Matter BLE traffic between an uncommissioned device and the Matter Sidecar; it does not own fabric or Thread credentials.
_Avoid_: Browser commissioner

**Thread Border Router**:
Infrastructure that routes IPv6 traffic between a Thread network and the customer's LAN; it does not decide access or interpret Matter behavior.
_Avoid_: Matter controller, Thread hub

**Thread Radio**:
The external IEEE 802.15.4 radio used by a Thread Border Router, including a dedicated radio in a single-radio adapter or one radio in a dual-radio adapter.
_Avoid_: Matter radio

**Attraccess Thread Network**:
The single Thread operational dataset managed by one Attraccess installation and shared by all of its Thread Border Routers.
_Avoid_: Border Router network

**Resource Actuation**:
A policy-approved physical action requested by Attraccess, such as unlocking a door or switching a machine output.
_Avoid_: Matter command

**Accepted Command**:
A command acknowledged by the Matter protocol or target device; it does not prove that the requested physical action occurred.
_Avoid_: Successful actuation

**Uncertain Actuation**:
A Resource Actuation for which Attraccess cannot determine whether the physical action occurred, usually because communication was lost before Reported State confirmed the outcome.
_Avoid_: Failed actuation, successful actuation

**Reported State**:
The latest physical or logical state reported by a Matter Device, kept distinct from requested and accepted commands.
_Avoid_: Desired state, assumed state

**Stale State**:
A Reported State whose device has not confirmed reachability within the expected interval; it remains historical information rather than evidence of current physical state.
_Avoid_: Offline state, current state

**External State Change**:
A Reported State change observed by Attraccess but not attributable to an Attraccess command or user, including changes initiated through another Matter fabric or physically at the device.
_Avoid_: Unauthorized change

**Actuation History**:
The durable record of requested, accepted, reported, faulted, and externally observed security or physical actions.
_Avoid_: Sensor history, telemetry archive

**Multi-Admin Device**:
A Matter Device that belongs to the Attraccess fabric and at least one independently controlled external fabric.
_Avoid_: Shared Attraccess device

**Fabric Identity**:
The durable cryptographic identity through which an Attraccess installation administers its commissioned Matter Devices.
_Avoid_: Matter account, fabric password
