
  console.log('[券脚本] simple response script executed');

  try {
    $notification.post('券脚本', '收到 response', ($request && $request.url) || '');
  } catch (e) {}

  $done({});