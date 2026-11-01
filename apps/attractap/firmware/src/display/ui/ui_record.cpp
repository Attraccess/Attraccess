#include "ui_record.hpp"
#include "ui_text.hpp"

#include <string.h>

namespace ui
{
    namespace
    {
        // Mirrors READER_UI_RESERVED_STATUS_STRINGS in the SDK (lower case, ASCII or Latin-1 as UTF-8).
        const char *const RESERVED[] = {
            "maintenance", "under maintenance", "in use", "available", "access granted", "access denied",
            "unavailable", "introduction required", "emergency stop", "firmware update", "wartung",
            "in wartung", "in benutzung", "verfuegbar", "verf\xC3\xBCgbar", "zugriff gewaehrt",
            "zugriff gew\xC3\xA4hrt", "zugriff verweigert", "einweisung erforderlich", "notaus",
        };

        bool idValid(const char *s, size_t maxLen)
        {
            if (!s) return false;
            const size_t n = strlen(s);
            if (n == 0 || n > maxLen) return false;
            for (size_t i = 0; i < n; i++)
            {
                const char c = s[i];
                if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || c == '-')) return false;
            }
            return true;
        }

        char lowerAscii(char c) { return (c >= 'A' && c <= 'Z') ? static_cast<char>(c + 32) : c; }

        struct Ctx
        {
            SlotRecord &rec;
            bool allowButtons;
            Verdict verdict;
        };

        bool toneFrom(JsonVariantConst v, Tone &out, Verdict &err)
        {
            out = Tone::None;
            if (v.isNull()) return true;
            const char *s = v.is<const char *>() ? v.as<const char *>() : nullptr;
            if (!s) { err = Verdict::BadEnum; return false; }
            if (!strcmp(s, "primary")) out = Tone::Primary;
            else if (!strcmp(s, "success")) out = Tone::Success;
            else if (!strcmp(s, "warning")) out = Tone::Warning;
            else if (!strcmp(s, "danger")) out = Tone::Danger;
            else { err = Verdict::BadEnum; return false; }
            return true;
        }

        bool smallInt(JsonVariantConst v, int maxV, uint8_t &out, Verdict &err)
        {
            if (v.isNull()) return true;
            if (!v.is<int>()) { err = Verdict::InvalidShape; return false; }
            const int n = v.as<int>();
            if (n < 0 || n > maxV) { err = Verdict::InvalidShape; return false; }
            out = static_cast<uint8_t>(n);
            return true;
        }

        // Copies sanitized text into the pool.
        bool takeText(SlotRecord &rec, JsonVariantConst v, int maxChars, Node &node, Verdict &err)
        {
            const char *s = v.is<const char *>() ? v.as<const char *>() : nullptr;
            if (!s || !*s) { err = Verdict::InvalidShape; return false; }
            const size_t cap = POOL_BYTES - rec.poolUsed;
            const size_t inLen = strlen(s);
            if (inLen + 1 > cap) { err = Verdict::PayloadTooLarge; return false; }
            char *dst = rec.pool + rec.poolUsed;
            const int chars = sanitizeLatin1(s, dst, cap);
            if (chars < 0) { err = Verdict::PayloadTooLarge; return false; }
            if (chars > maxChars) { err = Verdict::TextTooLong; return false; }
            if (isCoreStatusString(dst)) { err = Verdict::CoreStringSpoof; return false; }
            node.textOffset = rec.poolUsed;
            node.textLen = static_cast<uint16_t>(strlen(dst));
            rec.poolUsed = static_cast<uint16_t>(rec.poolUsed + node.textLen + 1);
            return true;
        }

        struct Frame
        {
            JsonObjectConst obj;
            uint8_t index;
        };

        Verdict fillNode(Ctx &ctx, JsonObjectConst o, Node &node)
        {
            Verdict err = Verdict::InvalidShape;
            const char *t = o["t"].is<const char *>() ? o["t"].as<const char *>() : nullptr;
            memset(&node, 0, sizeof(node));
            node.parent = NO_PARENT;
            node.style = TextStyle::Body;
            if (!t) return Verdict::UnknownComponent;
            if (!toneFrom(o["tone"], node.tone, err)) return err;
            SlotRecord &rec = ctx.rec;
            if (!strcmp(t, "col") || !strcmp(t, "row"))
            {
                node.type = t[0] == 'c' ? NodeType::Col : NodeType::Row;
                if (!o["c"].isNull() && !o["c"].is<JsonArrayConst>()) return Verdict::InvalidShape;
                if (!smallInt(o["gap"], 32, node.gap, err) || !smallInt(o["pad"], 32, node.pad, err)) return err;
                if (!o["fill"].isNull() && !o["fill"].is<bool>()) return Verdict::InvalidShape;
                node.fill = o["fill"] | false;
            }
            else if (!strcmp(t, "text"))
            {
                node.type = NodeType::Text;
                const char *st = o["style"].is<const char *>() ? o["style"].as<const char *>() : nullptr;
                if (!o["style"].isNull() && !st) return Verdict::BadEnum;
                if (st)
                {
                    if (!strcmp(st, "title")) node.style = TextStyle::Title;
                    else if (!strcmp(st, "small")) node.style = TextStyle::Small;
                    else if (strcmp(st, "body")) return Verdict::BadEnum;
                }
                if (!o["fill"].isNull() && !o["fill"].is<bool>()) return Verdict::InvalidShape;
                node.fill = o["fill"] | false;
                if (!takeText(rec, o["text"], MAX_TEXT_CHARS, node, err)) return err;
            }
            else if (!strcmp(t, "badge"))
            {
                node.type = NodeType::Badge;
                if (!takeText(rec, o["text"], MAX_LIST_ROW_CHARS, node, err)) return err;
            }
            else if (!strcmp(t, "icon"))
            {
                node.type = NodeType::Icon;
                const char *n = o["name"].is<const char *>() ? o["name"].as<const char *>() : nullptr;
                if (!n) return Verdict::BadEnum;
                if (!strcmp(n, "ok")) node.icon = Icon::Ok;
                else if (!strcmp(n, "warning")) node.icon = Icon::Warning;
                else if (!strcmp(n, "bell")) node.icon = Icon::Bell;
                else if (!strcmp(n, "lock")) node.icon = Icon::Lock;
                else if (!strcmp(n, "clock")) node.icon = Icon::Clock;
                else return Verdict::BadEnum;
                if (node.icon == Icon::Lock && node.tone == Tone::Danger) return Verdict::DangerLock;
            }
            else if (!strcmp(t, "button"))
            {
                if (!ctx.allowButtons) return Verdict::ButtonInSlot;
                node.type = NodeType::Button;
                if (!idValid(o["id"].is<const char *>() ? o["id"].as<const char *>() : nullptr, MAX_ID_CHARS))
                    return Verdict::BadId;
                const char *v = o["variant"].is<const char *>() ? o["variant"].as<const char *>() : nullptr;
                node.secondary = v && !strcmp(v, "secondary");
                if (!takeText(rec, o["text"], MAX_LABEL_BYTES, node, err)) return err;
            }
            else if (!strcmp(t, "progress"))
            {
                node.type = NodeType::Progress;
                if (!o["value"].is<double>()) return Verdict::InvalidShape;
                const double d = o["value"].as<double>();
                if (d < 0 || d > 100) return Verdict::InvalidShape;
                node.value = static_cast<uint8_t>(d);
            }
            else if (!strcmp(t, "countdown"))
            {
                node.type = NodeType::Countdown;
                if (!o["toMs"].is<int64_t>() || o["toMs"].as<int64_t>() < 0) return Verdict::InvalidShape;
                node.toMs = o["toMs"].as<int64_t>();
            }
            else if (!strcmp(t, "spacer"))
            {
                node.type = NodeType::Spacer;
                if (!smallInt(o["h"], 64, node.height, err)) return err;
            }
            else
            {
                return Verdict::UnknownComponent;
            }
            return Verdict::Accept;
        }

        // Pre-order walk with an explicit parent stack: no recursion, depth bounded by MAX_DEPTH.
        Verdict flatten(Ctx &ctx, JsonObjectConst root)
        {
            SlotRecord &rec = ctx.rec;
            Frame stack[MAX_DEPTH + 1];
            // Pending children: iterate arrays lazily with per-depth cursors.
            JsonArrayConst arrays[MAX_DEPTH + 1];
            size_t cursor[MAX_DEPTH + 1];
            auto push = [&](JsonObjectConst obj, uint8_t parent, int depth) -> Verdict {
                if (depth > MAX_DEPTH) return Verdict::TooDeep;
                if (rec.nodeCount >= MAX_NODES) return Verdict::TooManyNodes;
                Node &n = rec.nodes[rec.nodeCount];
                const Verdict v = fillNode(ctx, obj, n);
                if (v != Verdict::Accept) return v;
                n.parent = parent;
                const uint8_t idx = rec.nodeCount++;
                if (n.type == NodeType::Col || n.type == NodeType::Row)
                {
                    stack[depth - 1] = {obj, idx};
                    arrays[depth - 1] = obj["c"].as<JsonArrayConst>();
                    cursor[depth - 1] = 0;
                }
                return Verdict::Accept;
            };

            Verdict v = push(root, NO_PARENT, 1);
            if (v != Verdict::Accept) return v;
            if (rec.nodes[0].type != NodeType::Col && rec.nodes[0].type != NodeType::Row) return Verdict::Accept;
            int depth = 1; // containers on the stack
            while (depth >= 1)
            {
                const int slot = depth - 1;
                if (cursor[slot] >= arrays[slot].size())
                {
                    depth--;
                    continue;
                }
                JsonVariantConst child = arrays[slot][cursor[slot]++];
                if (!child.is<JsonObjectConst>()) return Verdict::InvalidShape;
                const uint8_t before = rec.nodeCount;
                v = push(child.as<JsonObjectConst>(), stack[slot].index, depth + 1);
                if (v != Verdict::Accept) return v;
                const Node &added = rec.nodes[before];
                if (added.type == NodeType::Col || added.type == NodeType::Row) depth++;
            }
            return Verdict::Accept;
        }
    }

    const char *verdictName(Verdict v)
    {
        switch (v)
        {
        case Verdict::Accept: return "accept";
        case Verdict::InvalidShape: return "invalid-shape";
        case Verdict::UnknownSlot: return "unknown-slot";
        case Verdict::UnknownComponent: return "unknown-component";
        case Verdict::BadEnum: return "bad-enum";
        case Verdict::TooManyNodes: return "too-many-nodes";
        case Verdict::TooDeep: return "too-deep";
        case Verdict::SlotBudget: return "slot-budget";
        case Verdict::PayloadTooLarge: return "payload-too-large";
        case Verdict::TextTooLong: return "text-too-long";
        case Verdict::BadId: return "bad-id";
        case Verdict::CoreStringSpoof: return "core-string-spoof";
        case Verdict::DangerLock: return "danger-lock";
        case Verdict::ButtonInSlot: return "button-in-slot";
        case Verdict::TooManyChoices: return "too-many-choices";
        }
        return "invalid-shape";
    }

    SlotId slotFromName(const char *name)
    {
        if (!name) return SlotId::Unknown;
        if (!strcmp(name, SLOT_LIST_ROW_STATUS)) return SlotId::ListRowStatus;
        if (!strcmp(name, SLOT_DETAILS_HEADER)) return SlotId::DetailsHeader;
        if (!strcmp(name, SLOT_DETAILS_BODY)) return SlotId::DetailsBody;
        if (!strcmp(name, SLOT_DETAILS_SESSION)) return SlotId::DetailsSession;
        return SlotId::Unknown;
    }

    int slotNodeBudget(SlotId slot)
    {
        switch (slot)
        {
        case SlotId::ListRowStatus: return SLOT_BUDGET_LIST_ROW_STATUS;
        case SlotId::DetailsHeader: return SLOT_BUDGET_DETAILS_HEADER;
        case SlotId::DetailsBody: return SLOT_BUDGET_DETAILS_BODY;
        case SlotId::DetailsSession: return SLOT_BUDGET_DETAILS_SESSION;
        default: return 0;
        }
    }

    bool isCoreStatusString(const char *text)
    {
        char buf[64];
        size_t start = 0;
        const size_t n = strlen(text);
        while (start < n && text[start] == ' ') start++;
        size_t end = n;
        while (end > start && (text[end - 1] == ' ' || text[end - 1] == '.' || text[end - 1] == '!' || text[end - 1] == ':'))
            end--;
        if (end - start == 0 || end - start >= sizeof(buf)) return false;
        for (size_t i = start; i < end; i++) buf[i - start] = lowerAscii(text[i]);
        buf[end - start] = '\0';
        for (const char *r : RESERVED)
            if (!strcmp(buf, r)) return true;
        return false;
    }

    Verdict parseSlotUpdate(JsonObjectConst payload, size_t payloadBytes, SlotRecord &out)
    {
        memset(&out, 0, sizeof(SlotRecord) - sizeof(out.pool));
        out.pool[0] = '\0';
        if (payloadBytes > MAX_PAYLOAD_BYTES) return Verdict::PayloadTooLarge;
        if (payload.isNull()) return Verdict::InvalidShape;
        const char *slotName = payload["slot"].is<const char *>() ? payload["slot"].as<const char *>() : nullptr;
        if (!payload["resourceId"].is<uint32_t>() || !payload["revision"].is<uint32_t>() ||
            !payload["serverNowMs"].is<int64_t>() || !slotName)
            return Verdict::InvalidShape;
        const char *owner = payload["owner"].is<const char *>() ? payload["owner"].as<const char *>() : nullptr;
        const char *key = payload["key"].is<const char *>() ? payload["key"].as<const char *>() : nullptr;
        if (!owner || !*owner || strlen(owner) > 64 || !idValid(key, MAX_ID_CHARS)) return Verdict::InvalidShape;
        out.slot = slotFromName(slotName);
        if (out.slot == SlotId::Unknown) return Verdict::UnknownSlot;
        out.resourceId = payload["resourceId"].as<uint32_t>();
        out.revision = payload["revision"].as<uint32_t>();
        out.serverNowMs = payload["serverNowMs"].as<int64_t>();
        out.expiresAtMs = payload["expiresAtMs"].is<int64_t>() ? payload["expiresAtMs"].as<int64_t>() : 0;
        strncpy(out.key, key, MAX_ID_CHARS);
        out.key[MAX_ID_CHARS] = '\0';

        JsonVariantConst tree = payload["tree"];
        if (tree.isNull())
        {
            for (JsonPairConst kv : payload)
                if (!strcmp(kv.key().c_str(), "tree")) out.removal = true;
            return out.removal ? Verdict::Accept : Verdict::InvalidShape;
        }
        if (!tree.is<JsonObjectConst>()) return Verdict::InvalidShape;

        Ctx ctx{out, false, Verdict::Accept};
        Verdict v = flatten(ctx, tree.as<JsonObjectConst>());
        if (v != Verdict::Accept) return v;
        if (out.nodeCount > slotNodeBudget(out.slot)) return Verdict::SlotBudget;
        if (out.slot == SlotId::ListRowStatus)
        {
            const NodeType t = out.nodes[0].type;
            if (t != NodeType::Text && t != NodeType::Badge) return Verdict::InvalidShape;
            int chars = 0;
            for (const char *c = out.text(out.nodes[0]); *c; c++)
                if ((*c & 0xC0) != 0x80) chars++;
            if (chars > MAX_LIST_ROW_CHARS) return Verdict::TextTooLong;
        }
        return Verdict::Accept;
    }
}
