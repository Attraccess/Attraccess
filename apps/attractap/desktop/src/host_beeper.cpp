#include <SDL3/SDL.h>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <mutex>
#include <numbers>
#include <vector>

namespace
{
constexpr int SampleRate = 48000;
constexpr float Volume = 0.2F;

SDL_AudioStream *stream = nullptr;
std::mutex streamMutex;

bool openStream()
{
    if (stream) return true;
    if (!SDL_InitSubSystem(SDL_INIT_AUDIO)) return false;

    const SDL_AudioSpec spec{SDL_AUDIO_F32, 1, SampleRate};
    stream = SDL_OpenAudioDeviceStream(SDL_AUDIO_DEVICE_DEFAULT_PLAYBACK, &spec, nullptr, nullptr);
    if (!stream) return false;
    SDL_ResumeAudioStreamDevice(stream);
    return true;
}

void appendTone(std::vector<float> &samples, float frequency, int durationMs)
{
    const size_t start = samples.size();
    const size_t count = static_cast<size_t>(SampleRate * durationMs / 1000);
    samples.resize(start + count);
    for (size_t index = 0; index < count; ++index)
    {
        const float envelope = std::min({static_cast<float>(index) / 200.0F, static_cast<float>(count - index) / 200.0F, 1.0F});
        samples[start + index] = std::sin(2.0F * std::numbers::pi_v<float> * frequency * static_cast<float>(index) / SampleRate) * Volume * envelope;
    }
}

void appendSilence(std::vector<float> &samples, int durationMs)
{
    samples.resize(samples.size() + static_cast<size_t>(SampleRate * durationMs / 1000));
}
}

void hostBeeper(const char *pattern)
{
    std::lock_guard lock(streamMutex);
    if (!openStream()) return;

    std::vector<float> samples;
    if (std::strcmp(pattern, "error") == 0)
    {
        appendTone(samples, 440.0F, 100);
        appendSilence(samples, 200);
        appendTone(samples, 440.0F, 100);
        appendSilence(samples, 200);
        appendTone(samples, 440.0F, 100);
    }
    else if (std::strcmp(pattern, "indicate") == 0)
    {
        appendTone(samples, 880.0F, 100);
        appendSilence(samples, 200);
        appendTone(samples, 880.0F, 100);
    }
    else
    {
        appendTone(samples, 1046.5F, 100);
    }
    SDL_PutAudioStreamData(stream, samples.data(), static_cast<int>(samples.size() * sizeof(samples.front())));
}
