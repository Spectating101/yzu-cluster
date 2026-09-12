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

test("public member gets an honest personal research-profile cold start", async ({ page }) => {
  await mockV2Api(page);
  await page.unroute("**/library/desk/capabilities").catch(() => {});
  await page.route("**/library/desk/capabilities", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(publicMemberCapabilities()),
  }));

  let savedBody = null;
  let configured = false;
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
  await expect(page.getByText("Sign in to view and save a researcher profile.")).toHaveCount(0);
  expect(facultyRequests).toBe(0);

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
});
