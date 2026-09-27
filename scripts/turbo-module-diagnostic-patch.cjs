const PATCH_MARKER = '[Tulona diagnostic] Async void TurboModule';
const DIAGNOSTIC_FILENAME = 'tulona-native-turbo-module-diagnostic.json';

const ORIGINAL_CATCH = `      // Void methods are always async, re-throw instead of converting to
      // JSError, same as the async branch in performMethodInvocation.
      @throw addModuleIdentityToException(exception, std::string{moduleName}, methodNameStr);`;

const DIAGNOSTIC_CATCH = `      // Temporary diagnostic workaround for release crashes in async void TurboModule calls.
      // Keep the exception off Hermes' background-thread path and save its native details.
      RCTLogError(
          @"${PATCH_MARKER} %s.%s raised %@: %@",
          moduleName,
          methodNameStr.c_str(),
          exception.name,
          exception.reason ?: @"(no reason)");

      NSURL *documentsDirectory = [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory
                                                                            inDomains:NSUserDomainMask] firstObject];
      if (documentsDirectory != nil) {
        NSURL *reportURL = [documentsDirectory URLByAppendingPathComponent:@"${DIAGNOSTIC_FILENAME}"];
        NSMutableArray<NSString *> *stackSymbols = [NSMutableArray array];
        for (NSString *symbol in exception.callStackSymbols) {
          if (stackSymbols.count >= 80) break;
          [stackSymbols addObject:symbol];
        }
        NSDictionary *bundleInfo = NSBundle.mainBundle.infoDictionary;
        NSDictionary *report = @{
          @"schemaVersion": @1,
          @"kind": @"native-turbo-module",
          @"capturedAt": [[NSISO8601DateFormatter new] stringFromDate:[NSDate date]],
          @"appVersion": bundleInfo[@"CFBundleShortVersionString"] ?: @"unknown",
          @"buildNumber": bundleInfo[@"CFBundleVersion"] ?: @"unknown",
          @"buildSha": bundleInfo[@"TULONA_BUILD_SHA"] ?: @"unknown",
          @"bundleIdentifier": NSBundle.mainBundle.bundleIdentifier ?: @"unknown",
          @"platformVersion": NSProcessInfo.processInfo.operatingSystemVersionString ?: @"unknown",
          @"moduleName": [NSString stringWithUTF8String:moduleName] ?: @"unknown",
          @"methodName": [NSString stringWithUTF8String:methodNameStr.c_str()] ?: @"unknown",
          @"exceptionName": exception.name ?: @"NSException",
          @"reason": exception.reason ?: @"(no reason)",
          @"stackSymbols": stackSymbols,
        };
        NSError *writeError = nil;
        NSData *reportData = [NSJSONSerialization dataWithJSONObject:report options:0 error:&writeError];
        if (reportData == nil || ![reportData writeToURL:reportURL options:NSDataWritingAtomic error:&writeError]) {
          RCTLogError(@"[Tulona diagnostic] Could not save native TurboModule report: %@", writeError);
        }
      }
      return;`;

const IMPORT_ANCHOR = '#import <React/RCTUtils.h>';
const DIAGNOSTIC_IMPORT = `${IMPORT_ANCHOR}\n#import <React/RCTLog.h>`;

function patchTurboModuleSource(source) {
  if (source.includes(PATCH_MARKER)) return source;

  if (!source.includes(ORIGINAL_CATCH)) {
    throw new Error(
      'Could not find the expected React Native async void TurboModule exception handler. ' +
        'The diagnostic patch may need to be updated for this React Native version.'
    );
  }

  if (!source.includes(IMPORT_ANCHOR)) {
    throw new Error(
      'Could not find the expected React Native logging import. ' +
        'The diagnostic patch may need to be updated for this React Native version.'
    );
  }

  return source.replace(IMPORT_ANCHOR, DIAGNOSTIC_IMPORT).replace(ORIGINAL_CATCH, DIAGNOSTIC_CATCH);
}

module.exports = { DIAGNOSTIC_FILENAME, PATCH_MARKER, patchTurboModuleSource };
