// app/lib/scripts/storage.ts
import { supabase } from '~/lib/superbase/client';
import fs from 'fs/promises';
import path from 'path';

const SCRIPTS_DIR = '/data/users';

export async function saveScript(userId: string, name: string, content: string) {
  // Save metadata to Supabase
  // const { data: script, error } = await supabase
  //   .from('trading_scripts')
  //   .insert({
  //     user_id: userId,
  //     name,
  //     file_path: `${userId}/${name}.py`
  //   })
  //   .select()
  //   .single();

  // if (error) throw error;

  // Save file locally
  const userDir = path.join(SCRIPTS_DIR, userId, 'scripts');
  await fs.mkdir(userDir, { recursive: true });
  await fs.writeFile(
    path.join(userDir, `${script.id}.py`),
    content
  );

  return script;
}

// Get script content
export async function getScript(userId: string, scriptId: string) {
  const { data: script } = await supabase
    .from('trading_scripts')
    .select()
    .match({ id: scriptId, user_id: userId })
    .single();

  if (!script) return null;

  const content = await fs.readFile(
    path.join(SCRIPTS_DIR, userId, 'scripts', `${scriptId}.py`),
    'utf-8'
  );

  return {
    ...script,
    content
  };
}
