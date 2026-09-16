import { test, expect } from "@playwright/test";
import { mockV2Api } from "./fixtures/v2MockApi.js";

function publicMemberCapabilities() {
  return {
    version: 2,
    authenticated: true,
    server_configured: true,
    access: "public_member",
    principal: {
      id: "cf-alice-0123456789abcdef0123456789abcdef",
      email: "alice@student.yzu.edu.tw",
      display_name: "Alice Student",
      role: "public_member",
    },
    permissions: {
      view_static_ui: true,
      view_research_data: true,
      view_faculty_profile: false,
      view_operations: false,
      use_ask: true,
      manage_research_profile: true,
      submit_collection: false,
      approve_jobs: false,
    },
    session: {
      bootstrap_available: true,
      public_guest_available: true,
      member_sign_in_available: true,
      member_sign_in_mode: "email",
      member_sign_in_path: "/library/desk/login",
    },
  };
}

test("public member gets an honest personal research-profile cold start", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 961 });
  await mockV2Api(page);
  await page.unroute("**/library/desk/capabilities").catch(() => {});
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(publicMemberCapabilities()),
  }));

  let savedBody = null;
  let configured = false;
  let memorySettings = { auto_learn: true, use_memory: true };
  let learnedMemories = [
    {
      id: "memory-wildfire",
      kind: "topic",
      value: "wildfire economics",
      scope: "account",
      evidence_count: 2,
      updated_at: "2026-09-15T00:00:00Z",
    },
  ];
  const memoryDocument = () => ({
    version: 1,
    settings: memorySettings,
    memories: learnedMemories,
    stored_count: learnedMemories.length,
    active_count: memorySettings.use_memory ? learnedMemories.length : 0,
    authority: {
      kind: "learned_research_memory",
      principal_scoped: true,
      separate_from_declared_profile: true,
      user_controllable: true,
    },
  });
  await page.route("**/library/profile/memory", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "settings") {
      memorySettings = { ...memorySettings, ...body };
      delete memorySettings.action;
    } else if (body.action === "forget") {
      learnedMemories = learnedMemories.filter((item) => item.id !== body.memory_id);
    } else if (body.action === "clear") {
      learnedMemories = [];
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(memoryDocument()),
    });
  });
  await page.route("**/library/profile", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      savedBody = request.postDataJSON();
      configured = true;
    }
    const profile = configured
      ? {
          academic_stage: "Master's student",
          discipline: "Finance",
          current_project: "Stablecoin trust thesis",
          research_topics: ["stablecoin trust"],
          methods: ["panel regression"],
          data_interests: ["market prices"],
        }
      : {};
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        principal: publicMemberCapabilities().principal,
        profile,
        configured,
        onboarding_required: !configured,
        starter_prompts: [],
        memory: memoryDocument(),
        authority: {
          identity: "authenticated_principal",
          research_context: configured ? "user_confirmed" : "empty",
          role_editable_here: false,
        },
      }),
    });
  });

  let facultyRequests = 0;
  await page.route("**/library/faculty/profile*", (route) => {
    facultyRequests += 1;
    return route.fulfill({ status: 403, contentType: "application/json", body: "{}" });
  });

  await page.goto("/?tab=profile", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("personal-research-profile")).toContainText("Alice Student");
  await expect(page.getByTestId("personal-research-profile")).toContainText("alice@student.yzu.edu.tw");
  await expect(page.getByTestId("research-profile-editor")).toContainText("Set up your research context");
  await expect(page.getByTestId("learned-research-memory")).toContainText("wildfire economics");
  await expect(page.getByTestId("learned-research-memory")).toContainText("2 supporting moments");
  await expect(page.getByTestId("profile-detail-rail")).toContainText("wildfire economics");
  await expect(page.getByTestId("profile-detail-rail")).toContainText("learned memory");
  await expect(page.getByTestId("profile-detail-rail")).not.toContainText("Not set up yet");
  await expect(page.getByText("Sign in to view and save a researcher profile.")).toHaveCount(0);
  expect(facultyRequests).toBe(0);

  // The wide Profile composition uses a two-column content grid. Because the
  // same element is a fixed-height scroll container, auto rows used to shrink
  // the identity to its padding while its text overflowed into the editor and
  // learned-memory row. Keep this as a geometry contract, not a screenshot-only
  // assertion, so CI fails on the actual overlap.
  const profileIdentityBox = await page.getByTestId("personal-research-profile").boundingBox();
  const identityCopyBox = await page.getByTestId("personal-research-profile").locator(".rd-v2-profile-ident").boundingBox();
  const identityMetricsBox = await page.getByTestId("personal-research-profile").locator(".rd-v2-profile-identity-side").boundingBox();
  const editorBox = await page.getByTestId("research-profile-editor").boundingBox();
  const learnedMemoryBox = await page.getByTestId("learned-research-memory").boundingBox();
  expect(profileIdentityBox).not.toBeNull();
  expect(identityCopyBox).not.toBeNull();
  expect(identityMetricsBox).not.toBeNull();
  expect(editorBox).not.toBeNull();
  expect(learnedMemoryBox).not.toBeNull();
  const identityContentBottom = Math.max(
    identityCopyBox.y + identityCopyBox.height,
    identityMetricsBox.y + identityMetricsBox.height,
  );
  expect(Math.min(editorBox.y, learnedMemoryBox.y)).toBeGreaterThanOrEqual(identityContentBottom - 1);
  await testInfo.attach("learned-research-memory", {
    body: await page.getByTestId("learned-research-memory").screenshot(),
    contentType: "image/png",
  });

  await page.getByLabel("Academic stage").fill("Master's student");
  await page.getByLabel("Field / discipline").fill("Finance");
  await page.getByLabel("What are you working on now?").fill("Stablecoin trust thesis");
  await page.getByLabel("Research topics").fill("stablecoin trust");
  await page.getByLabel("Methods").fill("panel regression");
  await page.getByLabel("Data interests").fill("market prices");
  await page.getByRole("button", { name: "Set up research context" }).click();

  await expect(page.getByTestId("research-profile-editor")).toContainText("Your research context");
  await expect(page.getByTestId("profile-detail-rail")).toContainText("Stablecoin trust thesis");
  await expect(page.getByTestId("profile-detail-rail")).not.toContainText("Not set up yet");
  expect(savedBody).toEqual({
    academic_stage: "Master's student",
    discipline: "Finance",
    current_project: "Stablecoin trust thesis",
    research_topics: ["stablecoin trust"],
    methods: ["panel regression"],
    data_interests: ["market prices"],
  });
  expect(savedBody).not.toHaveProperty("email");
  expect(savedBody).not.toHaveProperty("role");
  expect(savedBody).not.toHaveProperty("permissions");

  await page.getByLabel("Learn from Ask").click();
  await expect(page.getByLabel("Learn from Ask")).not.toBeChecked();
  await page.getByRole("button", { name: "Forget wildfire economics" }).click();
  await expect(page.getByTestId("learned-research-memory")).toContainText("Nothing has been learned yet");
});
