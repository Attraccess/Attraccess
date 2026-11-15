#include "connectionConfigurationScreen.hpp"
#include "display/i18n.hpp"
#include "../../shared/screenChrome.hpp"
#include "../../theme.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include "../../../platform.hpp"
#include "../../../state/state.hpp"
#include <string>

// Status tab: live connection health from State::getNetworkQualityState(),
// refreshed once a second while the screen is open (ATT-1273).

using FirmwareI18n::Message;
using FirmwareI18n::Text;

static const uint32_t STATUS_REFRESH_INTERVAL_MS = 1000;

// Row captions, in ConnectionConfigurationScreen::StatusRow order.
static constexpr Message STATUS_ROW_CAPTIONS[] = {
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
static_assert(sizeof(STATUS_ROW_CAPTIONS) / sizeof(STATUS_ROW_CAPTIONS[0]) == ConnectionConfigurationScreen::StatusRowCount,
              "every status row needs a caption");

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

void ConnectionConfigurationScreen::createStatusTab()
{
   lv_obj_t *statusTab = FirmwareI18n::addTab(this->tabs, Message::NetworkStatusTab);
   lv_obj_set_flex_flow(statusTab, LV_FLEX_FLOW_COLUMN);
   lv_obj_remove_flag(statusTab, LV_OBJ_FLAG_SCROLLABLE);
   // The rows scroll above the device footer, which the tab itself reaches.
   lv_obj_set_style_pad_bottom(statusTab, ScreenChrome::Bottom, LV_PART_MAIN);

   lv_obj_t *rows = lv_obj_create(statusTab);
   lv_obj_remove_style_all(rows);
   lv_obj_set_width(rows, lv_pct(100));
   lv_obj_set_flex_grow(rows, 1);
   lv_obj_set_flex_flow(rows, LV_FLEX_FLOW_COLUMN);
   lv_obj_set_style_pad_row(rows, 6, LV_PART_MAIN);
   lv_obj_set_scroll_dir(rows, LV_DIR_VER);

   for (size_t row = 0; row < StatusRowCount; ++row)
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
      FirmwareI18n::setLabel(caption, STATUS_ROW_CAPTIONS[row]);

      lv_obj_t *value = lv_label_create(container);
      lv_obj_set_width(value, LV_SIZE_CONTENT);
      lv_obj_set_style_text_font(value, &attractap_font_montserrat_latin1_16, LV_PART_MAIN);
      lv_obj_set_style_text_color(value, DisplayTheme::text(), LV_PART_MAIN);
      this->statusValues[row] = value;
   }

   this->refreshStatusTab();
}

void ConnectionConfigurationScreen::refreshStatusTab()
{
   this->lastStatusRefreshMs = millis();
   if (!this->statusValues[StatusQuality])
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
   if (!lv_color_eq(lv_obj_get_style_text_color(this->statusValues[StatusQuality], LV_PART_MAIN), qualityColor))
   {
      lv_obj_set_style_text_color(this->statusValues[StatusQuality], qualityColor, LV_PART_MAIN);
   }

   const Text values[StatusRowCount] = {
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
   for (size_t row = 0; row < StatusRowCount; ++row)
   {
      FirmwareI18n::setLabel(this->statusValues[row], values[row]);
   }
}

void ConnectionConfigurationScreen::refreshStatusTabIfDue()
{
   if (millis() - this->lastStatusRefreshMs >= STATUS_REFRESH_INTERVAL_MS)
   {
      this->refreshStatusTab();
   }
}
