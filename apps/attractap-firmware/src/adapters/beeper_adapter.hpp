#pragma once

#include "../ports/beeper_port.hpp"
#include "../beeper/beeper.hpp"

class BeeperAdapter : public IBeeperPort {
public:
  void setup() override { this->beeper.setup(); }
  void errorBeep() override { this->beeper.errorBeep(); }
  void successBeep() override { this->beeper.successBeep(); }
  void singleBeep() override { this->beeper.singleBeep(); }
  void indicateBeep() override { this->beeper.indicateBeep(); }

private:
  Beeper beeper;
};
