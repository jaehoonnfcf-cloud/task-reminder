// 관리자 전용: 담당자 등록 / 비밀번호 재설정 / 삭제 (verify_jwt=false, 내부에서 관리자 여부를 직접 확인)
// 호출: POST { action: "create" | "reset" | "delete", ... }  — 앱 수준 오류는 200 + { error } 로 돌려준다
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (msg: string) => json({ error: msg });

async function findUser(email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // 호출자 확인 + 관리자 여부
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: au } = await db.auth.getUser(jwt);
    const me = au?.user?.email?.toLowerCase();
    if (!me) return json({ error: "로그인이 필요합니다." }, 401);
    const { data: meRow } = await db.from("team_members").select("is_admin").eq("email", me).maybeSingle();
    if (!meRow?.is_admin) return json({ error: "관리자만 사용할 수 있습니다." }, 403);

    const b = await req.json();
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("이메일 형식을 확인해주세요.");
    const password = b.password ? String(b.password) : "";

    if (b.action === "create") {
      const name = String(b.name ?? "").trim();
      if (!name || name.length > 30) return fail("이름을 입력해주세요. (30자 이내)");
      let user = await findUser(email);
      let created = false;
      if (!user) {
        if (password.length < 8) return fail("새 계정은 비밀번호를 8자 이상 입력해야 합니다.");
        const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
        if (error) return fail("계정 생성 실패: " + error.message);
        user = data.user; created = true;
      } else if (password) {
        if (password.length < 8) return fail("비밀번호는 8자 이상이어야 합니다.");
        const { error } = await db.auth.admin.updateUserById(user.id, { password });
        if (error) return fail("비밀번호 설정 실패: " + error.message);
      }
      const { error: e2 } = await db.from("team_members").upsert({
        email, name, perm_credit: !!b.perm_credit, perm_deposit: !!b.perm_deposit, is_admin: !!b.is_admin,
      }, { onConflict: "email" });
      if (e2) {
        if (created && user) await db.auth.admin.deleteUser(user.id);   // 되돌리기
        return fail("담당자 등록 실패: " + e2.message);
      }
      return json({ ok: true, created });
    }

    if (b.action === "reset") {
      if (password.length < 8) return fail("비밀번호는 8자 이상이어야 합니다.");
      const user = await findUser(email);
      if (!user) return fail("해당 이메일의 계정이 없습니다.");
      const { error } = await db.auth.admin.updateUserById(user.id, { password });
      if (error) return fail("비밀번호 변경 실패: " + error.message);
      return json({ ok: true });
    }

    if (b.action === "delete") {
      if (email === me) return fail("본인 계정은 삭제할 수 없습니다.");
      await db.from("telegram_links").delete().eq("email", email);
      await db.from("team_members").delete().eq("email", email);
      const user = await findUser(email);
      if (user) await db.auth.admin.deleteUser(user.id);
      return json({ ok: true });
    }

    return fail("알 수 없는 요청입니다.");
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
