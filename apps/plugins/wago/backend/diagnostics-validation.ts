/** Never echo arbitrary device messages, unknown property names, or unknown error codes. */
const fields = new Set(
  'version physicalPoints logicalChannels id physicalPointId hardwareProfile channel profile capabilities disconnectPolicy mode timeoutMs range minimum maximum pulse durationMs guard channelId when feedback expected measurement unit scale offset'.split(
    ' ',
  ),
);
const codes = new Set(
  'invalid_snapshot unsupported_version invalid_channel invalid_collection invalid_object unknown_field required_field invalid_id duplicate_id unsupported_value invalid_capabilities unsupported_capability duplicate_capability unsupported_field invalid_range invalid_duration invalid_measurement invalid_feedback_channel invalid_timeout missing_capability unknown_reference invalid_reference content_hash_mismatch revision_mismatch hardware_unavailable'.split(
    ' ',
  ),
);
export function safeValidationSummaries(value: unknown): Array<{ path: string; code: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map((item) => {
    const error = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const path = typeof error.path === 'string' && error.path.length <= 256 ? error.path : '$';
    const tokens = path.replace(/\[(\d{1,5})\]/g, '.$1').split('.');
    const safe = tokens[0] === '$' && tokens.slice(1).every((token) => fields.has(token) || /^\d{1,5}$/.test(token));
    return {
      path: safe ? path : '$',
      code: codes.has(error.code as string) ? (error.code as string) : 'validation_error',
    };
  });
}
