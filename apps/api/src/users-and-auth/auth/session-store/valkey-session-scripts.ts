/** All session mutations run atomically with index updates. Sorted indexes prune TTL-expired members. */
export const SESSION_SCRIPT_COMMON = `
local now = tonumber(ARGV[1])
local function remove(token)
  local key = 'session:' .. token
  local data = redis.call('HGETALL', key)
  if #data == 0 then return 0 end
  local values = {}
  for i=1,#data,2 do values[data[i]]=data[i+1] end
  local expiry = tonumber(values.expiresAtMs or (now + redis.call('PTTL', key)))
  redis.call('DEL', key)
  redis.call('DEL', 'session_lineage:' .. (values.lineageId or token))
  redis.call('SREM', 'user_sessions:' .. values.userId, token)
  local indexes = cjson.decode(values.ssoIndexes or '[]')
  for _,index in ipairs(indexes) do redis.call('ZREM', index, token) end
  return expiry > now and 1 or 0
end
local function index(token, values, expiry)
  redis.call('SET', 'session_lineage:' .. (values.lineageId or token), token, 'PXAT', expiry)
  redis.call('SADD', 'user_sessions:' .. values.userId, token)
  redis.call('EXPIRE', 'user_sessions:' .. values.userId, 604800)
  for _,key in ipairs(cjson.decode(values.ssoIndexes or '[]')) do
    redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
    redis.call('ZADD', key, expiry, token)
    redis.call('EXPIRE', key, 604800)
  end
end
`;

export const CREATE_SESSION_SCRIPT =
  SESSION_SCRIPT_COMMON +
  `
local values = cjson.decode(ARGV[3])
for key,value in pairs(values) do redis.call('HSET', KEYS[1], key, value) end
redis.call('PEXPIREAT', KEYS[1], ARGV[4])
index(ARGV[2], values, tonumber(ARGV[4]))
return 1
`;

export const ROTATE_SESSION_SCRIPT =
  SESSION_SCRIPT_COMMON +
  `
local data = redis.call('HGETALL', KEYS[1])
if #data == 0 then return 0 end
local values = {}
for i=1,#data,2 do values[data[i]]=data[i+1] end
if tonumber(values.expiresAtMs or (now + redis.call('PTTL', KEYS[1]))) <= now then remove(ARGV[2]); return 0 end
values.lineageId = values.lineageId or ARGV[2]
remove(ARGV[2])
values.expiresAt = ARGV[5]
values.expiresAtMs = ARGV[4]
for key,value in pairs(values) do redis.call('HSET', KEYS[2], key, value) end
redis.call('PEXPIREAT', KEYS[2], ARGV[4])
index(ARGV[3], values, tonumber(ARGV[4]))
return 1
`;

export const REVOKE_SESSION_SCRIPT = SESSION_SCRIPT_COMMON + 'return remove(ARGV[2])';
// Existing sessions without a lineage index use their original token hash.
export const REVOKE_LOGOUT_SESSION_SCRIPT =
  SESSION_SCRIPT_COMMON + "return remove(redis.call('GET', KEYS[1]) or ARGV[2])";
export const REVOKE_USER_SCRIPT =
  SESSION_SCRIPT_COMMON +
  `
local count = 0
for _,token in ipairs(redis.call('SMEMBERS', KEYS[1])) do count = count + remove(token) end
redis.call('DEL', KEYS[1])
return count
`;

export const REVOKE_SSO_SCRIPT =
  SESSION_SCRIPT_COMMON +
  `
local selector = cjson.decode(ARGV[2])
local receipt = ARGV[3]
if receipt and tonumber(ARGV[4]) <= now then return {0,0} end
if receipt and redis.call('EXISTS', receipt) == 1 then return {0,0} end
local count = 0
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local function equal(a,b) return (a or '') == (b or '') end
for _,token in ipairs(redis.call('ZRANGE', KEYS[1], 0, -1)) do
  local raw = redis.call('HGET', 'session:' .. token, 'ssoContext')
  if raw then
    local context = cjson.decode(raw)
    local match = context.protocol == selector.protocol and context.providerId == selector.providerId
    if selector.protocol == 'OIDC' then
      match = match and context.issuer == selector.issuer and (selector.subject or selector.sid)
        and (not selector.subject or context.subject == selector.subject) and (not selector.sid or context.sid == selector.sid)
    else
      match = match and (not selector.issuer or context.issuer == selector.issuer) and context.nameID == selector.nameID and equal(context.nameIDFormat, selector.nameIDFormat)
        and equal(context.nameQualifier, selector.nameQualifier) and equal(context.spNameQualifier, selector.spNameQualifier)
      if selector.sessionIndexes and #selector.sessionIndexes > 0 then
        local found = false
        for _,wanted in ipairs(selector.sessionIndexes) do
          for _,actual in ipairs(context.sessionIndexes) do if wanted == actual then found = true end end
        end
        match = match and found
      end
    end
    match = match and (not selector.issuedBefore or not context.providerIssuedAt or context.providerIssuedAt <= selector.issuedBefore)
    if match then count = count + remove(token) end
  end
end
if receipt then
  if ARGV[5] == '1' and count == 0 then return {0,0} end
  redis.call('SET', receipt, 'seen', 'PX', math.max(1, tonumber(ARGV[4])-now))
  return {1,count}
end
return count
`;
