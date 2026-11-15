#include "networkStatusScreen.hpp"
#include "display/i18n.hpp"
#include "../../shared/headerButton.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../theme.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../../platform.hpp"
#include "../../../settings/settings.hpp"
#include "../../../state/state.hpp"
#include <string>

using FirmwareI18n::Message;
using FirmwareI18n::Text;

static const uint32_t REFRESH_INTERVAL_MS = 1000;

// Row captions, in NetworkStatusScreen::Row order.
static constexpr Message ROW_CAPTIONS[] = {
    Message::ConnectionQuality,
    Message::LastMessageAge,
    Message::LatestPing,
    Message::AveragePing,
    Message::PingTrend,
    Message::ReconnectsLastMinute,
    Message::SendQueueDepth,
    Message::SendQueueFullLastMinute,
    Message::SendFailuresLastMinute,
    Message::ConnectionTimeoutsLastMinute,
    Message::PingTimeoutsLastMinute,
    Message::PingLossLastMinute,
    Message::MissedHeartbeatsLastMinute,
};
static_assert(sizeof(ROW_CAPTIONS) / sizeof(ROW_CAPTIONS[0]) == NetworkStatusScreen::RowCount,
              "every network status row needs a caption");

static Text number(unsigned long value)
{
   return FirmwareI18n::Text::literal(std::to_string(value)) /* i18n-data: Measured network metric; digits only. */;
}

static Text milliseconds(unsigned long value)
{
   return Text::format(Message::Milliseconds, {number(value)});
}

static Text signedMilliseconds(int32_t value)
{
   return Text::format(Message::Milliseconds,
                       {FirmwareI18n::Text::literal((value > 0 ? "+" : "") + std::to_string(value)) /* i18n-data: Signed ping trend; digits and sign only. */});
}

static Text availableOr(bool available, const Text &value)
{
   return available ? value : Text(Message::NotAvailable);
}

void NetworkStatusScreen::init()
{
   if (this->screen)
   {
      return;
   }

   // Like the connection settings: the content starts below the drawer grabber
   // and the network badge, the PIN overlay covers everything below them.
   this->screen = lv_obj_create(nullptr);
   DisplayTheme::applyScreen(this->screen);
   lv_obj_set_style_pad_top(this->screen, ScreenChrome::Top, LV_PART_MAIN);
   lv_obj_remove_flag(this->screen, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *content = lv_obj_create(this->screen);
   lv_obj_remove_style_all(content);
   lv_obj_set_size(content, lv_pct(100), lv_pct(100));
   lv_obj_set_style_pad_left(content, ScreenChrome::Side, LV_PART_MAIN);
   lv_obj_set_style_pad_right(content, ScreenChrome::Side, LV_PART_MAIN);
   lv_obj_set_style_pad_bottom(content, ScreenChrome::Bottom, LV_PART_MAIN);
   lv_obj_set_style_pad_row(content, 10, LV_PART_MAIN);
   lv_obj_set_flex_flow(content, LV_FLEX_FLOW_COLUMN);
   lv_obj_remove_flag(content, LV_OBJ_FLAG_SCROLLABLE);

   lv_obj_t *header = lv_obj_create(content);
   lv_obj_remove_style_all(header);
   lv_obj_set_size(header, lv_pct(100), 46);
   lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
   lv_obj_set_flex_align(header, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
   lv_obj_set_style_pad_column(header, 12, LV_PART_MAIN);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_CLICKABLE);
   lv_obj_remove_flag(header, LV_OBJ_FLAG_SCROLLABLE);
   ReaderHeader::createBackButton(header, [](lv_event_t *event)
                                  { static_cast<NetworkStatusScreen *>(lv_event_get_user_data(event))->close(); }, this);
   lv_obj_t *title = lv_label_create(header);
   lv_obj_set_flex_grow(title, 1);
   lv_label_set_long_mode(title, LV_LABEL_LONG_DOT);
   lv_obj_set_style_text_font(title, &attractap_font_montserrat_latin1_24, LV_PART_MAIN);
   lv_obj_set_style_text_color(title, DisplayTheme::text(), LV_PART_MAIN);
   FirmwareI18n::setLabel(title, Message::NetworkStatus);

   lv_obj_t *rows = lv_obj_create(content);
   lv_obj_remove_style_all(rows);
   lv_obj_set_width(rows, lv_pct(100));
   lv_obj_set_flex_grow(rows, 1);
   lv_obj_set_flex_flow(rows, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_style_pad_row(rows, 8, LV_PART_MAIN);
   lv_obj_set_scroll_dir(rows, LV_DIR_VER);

   for (size_t row = 0; row < RowCount; ++row)
   {
      lv_obj_t *container = lv_obj_create(rows);
      lv_obj_remove_style_all(container);
      lv_obj_set_width(container, lv_pct(100));
      lv_obj_set_height(container, LV_SIZE_CONTENT);
      lv_obj_set_flex_flow(container, LV_FLEX_FLOW_ROW);
      lv_obj_set_flex_align(container, LV_FLEX_ALIGN_SPACE_BETWEEN, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
      lv_obj_set_style_pad_column(container, 10, LV_PART_MAIN);
      lv_obj_remove_flag(container, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_remove_flag(container, LV_OBJ_FLAG_SCROLLABLE);

      // Long German captions wrap; the value keeps its natural width.
      lv_obj_t *caption = lv_label_create(container);
      lv_obj_set_flex_grow(caption, 1);
      lv_label_set_long_mode(caption, LV_LABEL_LONG_WRAP);
      lv_obj_set_style_text_font(caption, &attractap_font_montserrat_latin1_16, LV_PART_MAIN);
      lv_obj_set_style_text_color(caption, DisplayTheme::muted(), LV_PART_MAIN);
      FirmwareI18n::setLabel(caption, ROW_CAPTIONS[row]);

      lv_obj_t *value = lv_label_create(container);
      lv_obj_set_width(value, LV_SIZE_CONTENT);
      lv_obj_set_style_text_font(value, &attractap_font_montserrat_latin1_16, LV_PART_MAIN);
      lv_obj_set_style_text_color(value, DisplayTheme::text(), LV_PART_MAIN);
      this->values[row] = value;
   }

   this->pinLockOverlay = this->pinInputPage.init(Message::UnlockWithPin, this->screen);
   lv_obj_add_flag(this->pinLockOverlay, LV_OBJ_FLAG_IGNORE_LAYOUT);
   lv_obj_set_align(this->pinLockOverlay, LV_ALIGN_CENTER);
   lv_obj_set_size(this->pinLockOverlay, lv_pct(100), lv_pct(100));
   lv_obj_set_pos(this->pinLockOverlay, 0, 0);
   if (!this->locked)
   {
      lv_obj_add_flag(this->pinLockOverlay, LV_OBJ_FLAG_HIDDEN);
   }
   this->pinInputPage.setOnCancelCallback([this]
                                          { this->close(); });
   this->pinInputPage.setOnConfirmCallback([this](std::string pin)
                                           { return this->onPinConfirmed(pin); });

   this->refresh();
}

void NetworkStatusScreen::lock()
{
   this->locked = true;
   if (this->pinLockOverlay)
   {
      lv_obj_remove_flag(this->pinLockOverlay, LV_OBJ_FLAG_HIDDEN);
   }
}

bool NetworkStatusScreen::onPinConfirmed(const std::string &pin)
{
   if (pin != Settings::getDeviceConfig().passCode)
   {
      // Same brute-force delay as the connection settings' PIN lock.
      delay(5000);
      return false;
   }
   this->locked = false;
   lv_obj_add_flag(this->pinLockOverlay, LV_OBJ_FLAG_HIDDEN);
   return true;
}

void NetworkStatusScreen::setOnCloseCallback(std::function<void()> onCloseCallback)
{
   this->onCloseCallback = std::move(onCloseCallback);
}

void NetworkStatusScreen::close()
{
   if (this->onCloseCallback)
   {
      this->onCloseCallback();
   }
}

void NetworkStatusScreen::refresh()
{
   this->lastRefreshMs = millis();
   if (!this->values[RowQuality])
   {
      return;
   }

   const State::NetworkQualityState state = State::getNetworkQualityState();
   Message quality = Message::ConnectionQualityOffline;
   lv_color_t qualityColor = DisplayTheme::danger();
   if (state.quality == State::NETWORK_QUALITY_GOOD)
   {
      quality = Message::ConnectionQualityGood;
      qualityColor = DisplayTheme::success();
   }
   else if (state.quality == State::NETWORK_QUALITY_DEGRADED)
   {
      quality = Message::ConnectionQualityDegraded;
      qualityColor = DisplayTheme::warning();
   }
   if (!lv_color_eq(lv_obj_get_style_text_color(this->values[RowQuality], LV_PART_MAIN), qualityColor))
   {
      lv_obj_set_style_text_color(this->values[RowQuality], qualityColor, LV_PART_MAIN);
   }

   const Text texts[RowCount] = {
       quality,
       availableOr(state.hasInboundMessage, milliseconds(state.lastInboundAgeMs)),
       availableOr(state.hasPongRttSample, milliseconds(state.lastPongRttMs)),
       availableOr(state.hasPongRttSample, milliseconds(state.averagePongRttMs)),
       availableOr(state.hasPongRttSample, signedMilliseconds(state.pongRttTrendMs)),
       number(state.reconnectsLastMinute),
       number(state.txQueueDepth),
       number(state.txQueueFullEventsLastMinute),
       number(state.sendFailuresLastMinute),
       number(state.livenessTimeoutsLastMinute),
       number(state.pongTimeoutsLastMinute),
       availableOr(state.hasCompletedPongProbe, Text::format(Message::Percent, {number(state.pongProbeLossPercentLastMinute)})),
       number(state.missedHeartbeatsLastMinute),
   };
   // setLabel only rewrites a label whose rendered text changed.
   for (size_t row = 0; row < RowCount; ++row)
   {
      FirmwareI18n::setLabel(this->values[row], texts[row]);
   }
}

void NetworkStatusScreen::loop()
{
   if (millis() - this->lastRefreshMs >= REFRESH_INTERVAL_MS)
   {
      this->refresh();
   }
}

lv_obj_t *NetworkStatusScreen::getScreen()
{
   return this->screen;
}

std::string NetworkStatusScreen::getName()
{
   return "NetworkStatusScreen";
}

void NetworkStatusScreen::onScreenLeave()
{
}

void NetworkStatusScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_delete(this->screen);
   this->screen = nullptr;
   this->pinLockOverlay = nullptr;
   for (lv_obj_t *&value : this->values)
   {
      value = nullptr;
   }
   this->lastRefreshMs = 0;
}
