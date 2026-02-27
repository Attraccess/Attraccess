#pragma once

class INetworkPort {
public:
  virtual ~INetworkPort() = default;

  virtual void setup() = 0;
  virtual void loop() = 0;
};
