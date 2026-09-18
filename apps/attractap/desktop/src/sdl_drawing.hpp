#pragma once

#include <SDL3/SDL.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <string>

namespace SdlDrawing
{
inline bool contains(const SDL_FRect &rect, float x, float y)
{
    return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

inline bool containsRounded(const SDL_FRect &rect, float radius, float x, float y)
{
    if (!contains(rect, x, y)) return false;
    const float dx = std::max(std::abs(x - (rect.x + rect.w / 2)) - (rect.w / 2 - radius), 0.0F);
    const float dy = std::max(std::abs(y - (rect.y + rect.h / 2)) - (rect.h / 2 - radius), 0.0F);
    return dx * dx + dy * dy <= radius * radius;
}

// A textured rounded rectangle clips the LVGL image to the CAD screen corners.
// The same geometry is used for the native card menu's rounded surfaces.
inline void roundedRect(SDL_Renderer *renderer, const SDL_FRect &rect, float radius,
                        SDL_Color color, SDL_Texture *texture = nullptr)
{
    constexpr int Steps = 8;
    constexpr int PerimeterVertices = 4 * (Steps + 1);
    constexpr float Pi = 3.14159265358979323846F;
    const SDL_FColor tint{color.r / 255.0F, color.g / 255.0F, color.b / 255.0F, color.a / 255.0F};
    std::array<SDL_Vertex, PerimeterVertices + 1> vertices;
    std::array<int, PerimeterVertices * 3> indices;
    vertices[0] = {{rect.x + rect.w / 2, rect.y + rect.h / 2}, tint, {0.5F, 0.5F}};
    for (int corner = 0; corner < 4; ++corner)
    {
        const float cx = rect.x + (corner == 0 || corner == 3 ? rect.w - radius : radius);
        const float cy = rect.y + (corner < 2 ? rect.h - radius : radius);
        for (int step = 0; step <= Steps; ++step)
        {
            const float angle = (static_cast<float>(corner) + static_cast<float>(step) / Steps) * Pi / 2;
            const float x = cx + std::cos(angle) * radius;
            const float y = cy + std::sin(angle) * radius;
            const int index = 1 + corner * (Steps + 1) + step;
            vertices[index] = {{x, y}, tint, {(x - rect.x) / rect.w, (y - rect.y) / rect.h}};
        }
    }
    for (int index = 0; index < PerimeterVertices; ++index)
    {
        indices[index * 3] = 0;
        indices[index * 3 + 1] = index + 1;
        indices[index * 3 + 2] = (index + 1) % PerimeterVertices + 1;
    }
    SDL_RenderGeometry(renderer, texture, vertices.data(), vertices.size(), indices.data(), indices.size());
}

inline void text(SDL_Renderer *renderer, float x, float y, const std::string &value, SDL_Color color)
{
    SDL_SetRenderDrawColor(renderer, color.r, color.g, color.b, color.a);
    SDL_RenderDebugText(renderer, x, y, value.c_str());
}

inline void centeredText(SDL_Renderer *renderer, const SDL_FRect &rect, float y,
                         const std::string &value, SDL_Color color)
{
    text(renderer, rect.x + (rect.w - static_cast<float>(value.size() * SDL_DEBUG_TEXT_FONT_CHARACTER_SIZE)) / 2,
         y, value, color);
}
}
