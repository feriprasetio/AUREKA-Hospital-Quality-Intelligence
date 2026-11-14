
test('global navigation module identity chip remains visible above contextual tabs', () => {
  const globalNavigation = read('app/aureka-global-navigation.css')
  assert.ok(globalNavigation.includes('.workspaceNavigationRail .workspaceNavigationRailTitle {'))
  assert.ok(globalNavigation.includes('display: inline-flex !important;'))
  assert.ok(globalNavigation.includes('visibility: visible !important;'))
  assert.ok(globalNavigation.includes('background: #172a40 !important;'))
})
