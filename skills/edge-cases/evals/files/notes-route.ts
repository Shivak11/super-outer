// GET /api/notes/:id
export async function getNote(req: { params: { id: string }; user: { id: string } }, db: any) {
  const note = await db.query("select * from notes where id = $1", [req.params.id]);
  return note.rows[0];
}
