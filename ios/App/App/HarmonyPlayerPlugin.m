#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Define the plugin using the CAP_PLUGIN Macro, and
// each method the plugin supports using the CAP_PLUGIN_METHOD macro.
CAP_PLUGIN(HarmonyPlayerPlugin, "HarmonyPlayer",
           CAP_PLUGIN_METHOD(play, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(playInline, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(pause, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(resume, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(seek, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(enterFullscreen, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(exitFullscreen, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(updateFrame, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(setPipMode, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(switchContent, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startNativePip, CAPPluginReturnPromise);
)
