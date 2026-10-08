function createCloudFiles(state) {
  const { ctx, scripts, json, wantsJson, hash, checksum, log, consume, sourceFromBody,
    validSource, validJavaScript, hasCloudAccess } = state;

  const listScripts = (req, res, user) => {
    if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
    const rows = ctx.db.prepare(`SELECT id,name,updated_at FROM ${scripts} WHERE user_id=? ORDER BY updated_at DESC`).all(user.id);
    return json(res, 200, { scripts: rows });
  };
  const getScript = (req, res, user) => {
    if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
    const row = ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id);
    if (!row) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { script: { id: row.id, name: row.name, updated_at: row.updated_at }, source: row.source, hash: row.hash, checksum: row.checksum });
  };
  const writeScript = (req, res, user, browserForm = false) => {
    if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
    if (!consume(`write:${user.id}`, 120, 60_000)) return json(res, 429, { error: 'rate_limited' });
    const source = sourceFromBody(req.body);
    const name = String(req.body?.name || '').trim();
    const existing = req.params.id ? ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id) : null;
    if (req.params.id && !existing) return json(res, 404, { error: 'not_found' });
    if (!validSource(name, source, existing && existing.name === name)) return json(res, 400, { error: 'invalid_script' });
    if (!validJavaScript(source)) return json(res, 400, { error: 'invalid_javascript' });
    const insert = ctx.db.transaction(() => {
      if (!existing) {
        const result = ctx.db.prepare(`INSERT INTO ${scripts} (user_id,name,source,hash,checksum) VALUES (?, ?, ?, ?, ?)`).run(user.id, name, source, hash(source), checksum(source));
        return { id: result.lastInsertRowid };
      }
      ctx.db.prepare(`UPDATE ${scripts} SET name=?,source=?,hash=?,checksum=?,updated_at=datetime('now') WHERE id=?`).run(name, source, hash(source), checksum(source), existing.id);
      return { id: existing.id };
    });
    let result;
    try {
      result = insert();
    } catch (error) {
      if (/UNIQUE/i.test(String(error && error.message))) return json(res, 409, { error: 'script_name_exists' });
      throw error;
    }
    log(user.id, 'script.write', String(result.id));
    if (browserForm && req.body?._csrf && !wantsJson(req)) return res.redirect(`/jslab-cloud/workspace/scripts/${result.id}`);
    json(res, 200, result);
  };
  const deleteScript = (req, res, user, browserForm = false) => {
    if (!hasCloudAccess(user)) return json(res, 403, { error: 'activation_required' });
    const row = ctx.db.prepare(`SELECT * FROM ${scripts} WHERE id=? AND user_id=?`).get(Number(req.params.id), user.id);
    if (!row) return json(res, 404, { error: 'not_found' });
    ctx.db.transaction(() => {
      ctx.db.prepare(`DELETE FROM ${scripts} WHERE id=?`).run(row.id);
    })();
    log(user.id, 'script.delete', String(row.id));
    if (browserForm && req.body?._csrf && !wantsJson(req)) return res.redirect('/jslab-cloud/workspace');
    json(res, 200, { id: row.id, deleted: true });
  };
  return { listScripts, getScript, writeScript, deleteScript };
}

module.exports = { createCloudFiles };
