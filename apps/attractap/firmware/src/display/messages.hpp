#pragma once

#include <cstdio>
#include <string>
#include <vector>
#include "../state/language.hpp"
#include "messages.catalog.hpp"

// Firmware-owned text is identified independently of its displayed wording.
namespace FirmwareI18n {

inline const char *messageText(Message id, const std::string &locale) {
    const auto index = static_cast<size_t>(id);
    if (index >= static_cast<size_t>(Message::Count)) {
        std::fprintf(stderr, "Unknown firmware message identifier: %zu\n", index);
        return "Something went wrong. Please try again.";
    }
    const auto &entry = catalog[index];
    return Language::text(entry.en, entry.de, locale);
}

// A text value retains its identity and arguments until the widget is deleted.
// Literal data is never looked up, parsed as a format string, or translated.
struct Text {
    Message id = Message::Count;
    std::string value;
    std::vector<Text> arguments;
    bool isLiteral = true;

    Text() = default;
    Text(Message message) : id(message), isLiteral(false) {}
    static Text literal(std::string data) { Text result; result.value = std::move(data); return result; }
    static Text format(Message message, std::vector<Text> args) {
        Text result(message); result.arguments = std::move(args); return result;
    }
    bool empty() const { return isLiteral && value.empty(); }
    void clear() { *this = Text(); }
    bool operator==(const Text &other) const {
        return id == other.id && value == other.value && arguments == other.arguments && isLiteral == other.isLiteral;
    }
    bool operator!=(const Text &other) const { return !(*this == other); }
    std::string render(const std::string &locale) const {
        if (isLiteral) return value;
        const std::string pattern = messageText(id, locale);
        std::string result;
        for (size_t i = 0; i < pattern.size();) {
            if (pattern[i] == '{' && i + 2 < pattern.size() && pattern[i + 1] >= '0' && pattern[i + 1] <= '9' && pattern[i + 2] == '}') {
                const size_t argument = pattern[i + 1] - '0';
                if (argument < arguments.size()) result += arguments[argument].render(locale);
                else std::fprintf(stderr, "Missing argument %zu for firmware message %zu\n", argument, static_cast<size_t>(id));
                i += 3;
            } else result += pattern[i++];
        }
        return result;
    }
};
inline Text formError(const std::string &code) {
    if (code == "REQUIRED_FIELD") return Message::RequiredField;
    if (code == "INVALID_NUMBER") return Message::InvalidNumber;
    if (code == "INVALID_SELECTION") return Message::InvalidSelection;
    if (code == "INVALID_INPUT" || code == "UNKNOWN_FIELD") return Message::InvalidInput;
    // Unknown or legacy messages have no reliable language. Keep diagnostics
    // in the API log and display the English fallback.
    return Text::literal(messageText(Message::InvalidInput, "en"));
}
inline Text readerError(const std::string &code) {
    if (code == "USER_NOT_SET") return Message::NoUserSelected;
    if (code == "INVALID_PARAMS") return Message::ErrorInvalidParams;
    if (code == "CARD_ALREADY_ENROLLED") return Message::ErrorCardAlreadyEnrolled;
    if (code == "ENROLL_NEW_CARD_DATA_NOT_SET") return Message::ErrorEnrollNewCardDataNotSet;
    if (code == "KEY_NOT_SET") return Message::ErrorKeyNotSet;
    if (code == "USER_NOT_FOUND") return Message::ErrorUserNotFound;
    if (code == "RESET_NFC_CARD_DATA_NOT_SET") return Message::ErrorResetNfcCardDataNotSet;
    if (code == "INVALID_UID") return Message::ErrorInvalidUid;
    if (code == "CARD_NOT_FOUND") return Message::ErrorCardNotFound;
    if (code == "CARD_NOT_ACTIVE") return Message::ErrorCardNotActive;
    if (code == "INVALID_RESOURCE_ID") return Message::ErrorInvalidResourceId;
    if (code == "READER_NOT_FOUND") return Message::ErrorReaderNotFound;
    if (code == "RESOURCE_NOT_ASSOCIATED_WITH_READER") return Message::ErrorResourceNotAssociatedWithReader;
    if (code == "USER_NOT_AUTHENTICATED") return Message::ErrorUserNotAuthenticated;
    if (code == "INSUFFICIENT_BALANCE") return Message::InsufficientBalance;
    if (code == "SUMUP_NOT_ENABLED") return Message::ErrorSumupNotEnabled;
    if (code == "INVALID_AMOUNT") return Message::ErrorInvalidAmount;
    if (code == "NO_SUMUP_TERMINALS_AVAILABLE") return Message::ErrorNoSumupTerminalsAvailable;
    if (code == "SUMUP_TOPUP_FAILED") return Message::ErrorSumupTopupFailed;
    if (code == "CARD_MISMATCH") return Message::ErrorCardMismatch;
    if (code == "NO_MASS_INTRODUCTION_IN_PROGRESS") return Message::ErrorNoMassIntroductionInProgress;
    if (code == "MASS_INTRODUCTION_FAILED") return Message::ErrorMassIntroductionFailed;
    std::fprintf(stderr, "Unknown reader error: %s\n", code.c_str());
    // Unknown server errors have no reliable language; preserve English fallback.
    return Text::literal("Something went wrong. Please try again.");
}
}
