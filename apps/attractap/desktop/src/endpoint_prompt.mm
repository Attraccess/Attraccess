#import <Cocoa/Cocoa.h>

#include "endpoint_prompt.hpp"
#include "api_endpoint.hpp"

#include <exception>
#include <string>

std::string promptForEndpoint()
{
    @autoreleasepool
    {
        [NSApplication sharedApplication];
        [NSApp setActivationPolicy:NSApplicationActivationPolicyRegular];
        [NSApp activateIgnoringOtherApps:YES];

        NSUserDefaults *defaults = [NSUserDefaults standardUserDefaults];
        NSString *savedEndpoint = [defaults stringForKey:@"AttraccessServerEndpoint"];
        NSString *value = savedEndpoint ?: @"https://";
        NSString *message = @"Enter the URL of your Attraccess server.";

        while (true)
        {
            NSAlert *alert = [[NSAlert alloc] init];
            alert.messageText = @"Connect Attractap Simulator";
            alert.informativeText = message;
            [alert addButtonWithTitle:@"Connect"];
            [alert addButtonWithTitle:@"Quit"];

            NSTextField *field = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 360, 24)];
            field.stringValue = value;
            field.placeholderString = @"https://your-server.example";
            alert.accessoryView = field;
            [alert.window setInitialFirstResponder:field];

            if ([alert runModal] != NSAlertFirstButtonReturn)
                return {};

            value = [field.stringValue stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
            const std::string endpoint = value.UTF8String ?: "";
            try
            {
                if (endpoint.find("://") == std::string::npos)
                    throw std::invalid_argument("Include https:// or http:// in the address.");
                parseApiEndpoint(endpoint);
                [defaults setObject:value forKey:@"AttraccessServerEndpoint"];
                return endpoint;
            }
            catch (const std::exception &error)
            {
                message = [NSString stringWithFormat:@"Please check the server URL: %s", error.what()];
            }
        }
    }
}
