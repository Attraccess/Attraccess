# Resources System Research

## Resource Entity
- name, type (Machine/Door), description, image, metadata
- Documentation: MARKDOWN or URL
- separateUnlockAndUnlatch (doors), allowTakeOver
- Relations: introductions, usages, flows, forms, groups, attractap readers, maintenance, billing

## Introduction System
- ResourceIntroduction: grants user access (per resource or resource group)
- ResourceIntroducer: allows user to grant introductions to others
- History tracking: revoke/grant audit trail with comments

## Maintenance System
- Manual maintenance records (start/end, reason, created by, completed by)
- Automated schedules: USAGE_HOURS, USAGE_COUNT, TIME_INTERVAL triggers
- Each trigger type has config entity (duration/unit, threshold, etc.)

## Flow System (27+ node types)
Input: Button, Usage Start/Stop/Takeover, Door events, MQTT message, Inactivity
Output: HTTP request, MQTT message, Billing items, End session, Track activity
Processing: Wait, If condition, Set payload, MQTT wait, Error

## Forms System
- Form attached to resource, with fields (TEXT, NUMBER, BOOLEAN, SELECT)
- Required on: usage start, takeover, or end
- Submissions linked to usage session and user

## Resource Groups
- Group multiple resources, apply introductions at group level

## Billing
- ResourceBillingConfiguration: creditsPerUsage, creditsPerMinute
- ResourceUsage tracks sessions with start/end times, notes, project, forms
