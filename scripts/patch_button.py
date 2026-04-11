import re

path = r'f:\ea-niti-edge-agent-10-04-2026_V2\src\components\admin\AgentConfigTab.tsx'
content = open(path, 'r', encoding='utf-8').read()

# Locate the static button block by line-signature
old_button_lines = [
    '                      <button onClick={() => handlePullWebCache(config.id, config.url)} className="text-xs px-3 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30 rounded-lg transition-colors font-bold uppercase">',
    '                         PULL WEB CACHE',
    '                      </button>',
]

new_block = '''                      {(() => {
                        const isThisDownloading = downloadState.status === 'Downloading' && downloadState.modelId === config.id;
                        return (
                          <button
                            onClick={() => handlePullWebCache(config.id, config.url)}
                            disabled={isThisDownloading}
                            aria-label="Pull Web Cache"
                            title={isThisDownloading ? 'Download in progress...' : 'Pull Web Cache'}
                            className={`text-xs px-3 py-2 rounded-lg transition-all font-bold uppercase flex items-center gap-1 whitespace-nowrap ${isThisDownloading ? 'bg-blue-600 text-white opacity-70 cursor-not-allowed animate-pulse' : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400 dark:hover:bg-blue-500/30'}`}
                          >
                            {isThisDownloading && <Loader2 size={12} className="animate-spin shrink-0" />}
                            {isThisDownloading ? 'Downloading...' : 'PULL WEB CACHE'}
                          </button>
                        );
                      })()}'''

old_block = '\n'.join(old_button_lines)
if old_block in content:
    content = content.replace(old_block, new_block, 1)
    open(path, 'w', encoding='utf-8').write(content)
    print('SUCCESS: Button patched.')
else:
    # Fallback: find the button line
    idx = content.find('handlePullWebCache(config.id, config.url)} className="text-xs px-3 py-2 bg-blue-100')
    if idx >= 0:
        print('PARTIAL MATCH at index:', idx)
        print(repr(content[idx-50:idx+200]))
    else:
        print('NOT FOUND - manual inspection needed')
