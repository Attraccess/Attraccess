#pragma once

class ISerialCommandPort {
public:
  virtual ~ISerialCommandPort() = default;

  virtual void setup() = 0;
  virtual void loop() = 0;
};
