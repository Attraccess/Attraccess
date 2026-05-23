#include "setPinScreen.hpp"
#include <cstring>

void SetPinScreen::init()
{
   if (this->screen)
   {
      return;
   }
   this->pinInputPage.setOnConfirmCallback([this](String pin)
                                           { this->onPinConfirmed(pin); return true; });
   this->screen = this->pinInputPage.init("Geraete-PIN");
}

void SetPinScreen::setOnPinConfirmedCallback(std::function<void(String)> onPinConfirmed)
{
   this->onPinConfirmed = onPinConfirmed;
}

void SetPinScreen::loop()
{
}

lv_obj_t *SetPinScreen::getScreen()
{
   return this->screen;
}

String SetPinScreen::getName()
{
   return "SetPinScreen";
}

void SetPinScreen::onScreenLeave()
{
}

void SetPinScreen::destroy()
{
   if (!this->screen)
   {
      return;
   }
   lv_obj_del(this->screen);
   this->screen = nullptr;
}