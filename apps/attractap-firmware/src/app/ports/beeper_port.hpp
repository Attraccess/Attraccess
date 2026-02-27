#pragma once

class IBeeperPort {
public:
  virtual ~IBeeperPort() = default;

  virtual void setup() = 0;
  virtual void errorBeep() = 0;
  virtual void successBeep() = 0;
  virtual void singleBeep() = 0;
  virtual void indicateBeep() = 0;
};
