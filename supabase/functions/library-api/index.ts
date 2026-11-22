
import { createClient } from "npm:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const PROJECT_ID = "campus-dz-d2a18";
const BUCKET = "campus-library";
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(
  SUPABASE_URL,
  SERVICE_KEY ?? "",
);

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function error(message: string, status = 400) {
  return response(
    { success: false, error: message },
    status,
  );
}

// Firebase authentication
async function authenticate(req: Request) {
  const header = req.headers.get("Authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new Error("Missing Firebase token");
  }

  const token = header.slice(7);

  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });

  if (!payload.sub) {
    throw new Error("Invalid user");
  }

  return {
    uid: payload.sub,
    admin: payload.admin === true,
  };
}

const categories = [
  "cours",
  "resumes",
  "td",
  "examens",
  "livres",
  "research",
];

async function handle(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (!SERVICE_KEY) {
    return error("Server configuration error", 500);
  }

  try {
    const user = await authenticate(req);
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // List approved files
    if (action === "list") {
      const adminView =
        user.admin &&
        url.searchParams.get("status") === "pending";

      let query = supabase
        .from("library_files")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      query = adminView
        ? query.eq("status", "pending")
        : query.eq("status", "approved");

      const specialty = url.searchParams.get("specialty");
      const moduleName = url.searchParams.get("module");
      const category = url.searchParams.get("category");
      const year = url.searchParams.get("study_year");
      const semester = url.searchParams.get("semester");

      if (specialty) query = query.eq("specialty", specialty);
      if (moduleName) query = query.eq("module", moduleName);
      if (category) query = query.eq("category", category);
      if (year) query = query.eq("study_year", Number(year));
      if (semester) query = query.eq("semester", Number(semester));

      const { data, error: dbError } = await query;

      if (dbError) return error(dbError.message, 500);

      return response({
        success: true,
        files: data,
      });
    }

    // User files
    if (action === "my_files") {
      const { data, error: dbError } = await supabase
        .from("library_files")
        .select("*")
        .eq("owner_uid", user.uid)
        .order("created_at", { ascending: false });

      if (dbError) return error(dbError.message, 500);

      return response({
        success: true,
        files: data,
      });
    }

    // Upload PDF
    if (action === "upload") {
      if (req.method !== "POST") {
        return error("POST method required", 405);
      }

      const form = await req.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return error("PDF file is required");
      }

      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        return error(
          "File size must be between 1 byte and 20 MB",
        );
      }

      if (!file.name.toLowerCase().endsWith(".pdf")) {
        return error("Only PDF files are allowed");
      }

      const bytes = new Uint8Array(
        await file.arrayBuffer(),
      );

      const signature = new TextDecoder().decode(
        bytes.slice(0, 5),
      );

      if (signature !== "%PDF-") {
        return error("Invalid PDF file");
      }

      const title = String(form.get("title") ?? "").trim();
      const description = String(form.get("description") ?? "");
      const specialty = String(form.get("specialty") ?? "").trim();
      const studyYear = Number(form.get("study_year"));
      const semester = Number(form.get("semester"));
      const moduleName = String(form.get("module") ?? "").trim();
      const category = String(form.get("category") ?? "");

      if (
        !title ||
        !specialty ||
        !moduleName ||
        !Number.isInteger(studyYear) ||
        studyYear < 1 ||
        studyYear > 6 ||
        ![1, 2].includes(semester) ||
        !categories.includes(category)
      ) {
        return error("Invalid or missing document information");
      }

      const path = `${user.uid}/${crypto.randomUUID()}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (uploadError) {
        return error(uploadError.message, 500);
      }

      const { data, error: insertError } = await supabase
        .from("library_files")
        .insert({
          owner_uid: user.uid,
          title,
          description,
          specialty,
          study_year: studyYear,
          semester,
          module: moduleName,
          category,
          original_name: file.name,
          storage_path: path,
          file_size: file.size,
          status: "pending",
        })
        .select()
        .single();

      if (insertError) {
        await supabase.storage.from(BUCKET).remove([path]);
        return error(insertError.message, 500);
      }

      return response({
        success: true,
        message: "File uploaded and waiting for admin approval",
        file: data,
      });
    }

    // Approve or reject
    if (action === "approve" || action === "reject") {
      if (req.method !== "POST") {
        return error("POST method required", 405);
      }

      if (!user.admin) {
        return error("Admin access required", 403);
      }

      const body = await req.json();
      const fileId = String(body.file_id ?? "");

      if (!fileId) return error("file_id is required");

      const updateData: Record<string, unknown> = {
        status: action === "approve" ? "approved" : "rejected",
        approved_by: user.uid,
        reviewed_at: new Date().toISOString(),
        rejection_reason:
          action === "reject"
            ? String(body.reason ?? "لم يتم تحديد السبب")
            : null,
      };

      const { data, error: updateError } = await supabase
        .from("library_files")
        .update(updateData)
        .eq("id", fileId)
        .eq("status", "pending")
        .select()
        .single();

      if (updateError) return error(updateError.message, 500);

      return response({
        success: true,
        file: data,
      });
    }

    // Secure PDF download
    if (action === "download") {
      const fileId = url.searchParams.get("file_id");

      if (!fileId || fileId === "undefined" || fileId === "null") {
        return error("Valid file_id is required");
      }

      const { data: file, error: dbError } = await supabase
        .from("library_files")
        .select("*")
        .eq("id", fileId)
        .maybeSingle();

      if (dbError || !file) {
        return error("File not found", 404);
      }

      const allowed =
        file.status === "approved" ||
        file.owner_uid === user.uid ||
        user.admin;

      if (!allowed) {
        return error("Access denied", 403);
      }

      if (!file.storage_path) {
        return error("File storage path is missing", 404);
      }

      const { data, error: signedError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(file.storage_path, 600);

      if (signedError || !data?.signedUrl) {
        return error(
          signedError?.message ?? "Could not create download link",
          500,
        );
      }

      return response({
        success: true,
        url: data.signedUrl,
        expires_in: 600,
      });
    }

    // Delete file
    if (action === "delete") {
      if (req.method !== "POST") {
        return error("POST method required", 405);
      }

      const body = await req.json();
      const fileId = String(body.file_id ?? "");

      if (!fileId) return error("file_id is required");

      const { data: file, error: findError } = await supabase
        .from("library_files")
        .select("*")
        .eq("id", fileId)
        .maybeSingle();

      if (findError || !file) {
        return error("File not found", 404);
      }

      const allowed =
        user.admin ||
        (
          file.owner_uid === user.uid &&
          ["pending", "rejected"].includes(file.status)
        );

      if (!allowed) return error("Access denied", 403);

      const { error: removeError } = await supabase.storage
        .from(BUCKET)
        .remove([file.storage_path]);

      if (removeError) return error(removeError.message, 500);

      const { error: deleteError } = await supabase
        .from("library_files")
        .delete()
        .eq("id", fileId);

      if (deleteError) return error(deleteError.message, 500);

      return response({
        success: true,
        message: "File deleted",
      });
    }

    // Add favorite
    if (action === "favorite_add") {
      if (req.method !== "POST") {
        return error("POST method required", 405);
      }

      const body = await req.json();

      if (!body.file_id) return error("file_id is required");

      const { error: dbError } = await supabase
        .from("library_favorites")
        .upsert(
          {
            file_id: body.file_id,
            user_uid: user.uid,
          },
          {
            onConflict: "file_id,user_uid",
          },
        );

      if (dbError) return error(dbError.message, 500);

      return response({ success: true });
    }

    // Remove favorite
    if (action === "favorite_remove") {
      if (req.method !== "POST") {
        return error("POST method required", 405);
      }

      const body = await req.json();

      if (!body.file_id) return error("file_id is required");

      const { error: dbError } = await supabase
        .from("library_favorites")
        .delete()
        .eq("file_id", body.file_id)
        .eq("user_uid", user.uid);

      if (dbError) return error(dbError.message, 500);

      return response({ success: true });
    }

    // Rate file
    if (action === "rate") {
      if (req.method !== "POST") {
        return error("POST method required", 405);
      }

      const body = await req.json();
      const rating = Number(body.rating);

      if (
        !body.file_id ||
        !Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5
      ) {
        return error("Rating must be between 1 and 5");
      }

      const { error: dbError } = await supabase
        .from("library_ratings")
        .upsert(
          {
            file_id: body.file_id,
            user_uid: user.uid,
            rating,
          },
          {
            onConflict: "file_id,user_uid",
          },
        );

      if (dbError) return error(dbError.message, 500);

      return response({ success: true });
    }

    // Report file
    if (action === "report") {
      if (req.method !== "POST") {
        return error("POST method required", 405);
      }

      const body = await req.json();
      const reason = String(body.reason ?? "").trim();

      if (!body.file_id || !reason) {
        return error("File and report reason are required");
      }

      const { error: dbError } = await supabase
        .from("library_reports")
        .insert({
          file_id: body.file_id,
          user_uid: user.uid,
          reason,
          details: String(body.details ?? ""),
        });

      if (dbError) return error(dbError.message, 500);

      return response({ success: true });
    }

    return error("Unknown action", 404);

  } catch (e) {
    const message =
      e instanceof Error
        ? e.message
        : "Unexpected server error";

    return error(message, 401);
  }
}

Deno.serve(handle);
