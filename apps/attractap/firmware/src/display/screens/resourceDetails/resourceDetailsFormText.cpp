#include "resourceDetailsScreen.hpp"
#include "../../fonts/attractap_fonts.hpp"
#include <string>
#include <functional>
#include <lvgl.h>
#include <time.h>
#include <stdio.h>
#include <cstdlib>
#include "resourceDetailsFormText.hpp"

// Form values must remain unchanged for submission, so prepare a separate
// display string for code points not covered by the reader's Latin-1 fonts.
std::string makeLVGLDisplayText(const std::string &input)
{
   std::string output;
   for (size_t index = 0; index < input.length();)
   {
      const unsigned char byte = static_cast<unsigned char>(input[index]);
      if (byte < 0x80)
      {
         output += input[index++];
         continue;
      }

      uint32_t codepoint = 0;
      size_t length = 0;
      if ((byte & 0xE0) == 0xC0 && index + 1 < input.length())
      {
         codepoint = ((byte & 0x1F) << 6) | (static_cast<unsigned char>(input[index + 1]) & 0x3F);
         length = 2;
      }
      else if ((byte & 0xF0) == 0xE0 && index + 2 < input.length())
      {
         codepoint = ((byte & 0x0F) << 12) | ((static_cast<unsigned char>(input[index + 1]) & 0x3F) << 6) |
                     (static_cast<unsigned char>(input[index + 2]) & 0x3F);
         length = 3;
      }
      else
      {
         output += '?';
         ++index;
         continue;
      }

      if (codepoint >= 0xA0 && codepoint <= 0xFF)
      {
         output.append(input, index, length);
      }
      else if (codepoint >= 0x300 && codepoint <= 0x36F)
      {
         // Keep the base character of decomposed accents.
      }
      else
      {
         switch (codepoint)
         {
         case 0x2018:
         case 0x2019:
         case 0x201A:
         case 0x2032:
            output += '\'';
            break;
         case 0x201C:
         case 0x201D:
         case 0x201E:
         case 0x2033:
            output += '"';
            break;
         case 0x2013:
         case 0x2014:
         case 0x2015:
         case 0x2022:
            output += '-';
            break;
         case 0x2026:
            output += "...";
            break;
         case 0x2122:
            output += "TM";
            break;
         default:
            output += '?';
            break;
         }
      }
      index += length;
   }
   return output;
}
