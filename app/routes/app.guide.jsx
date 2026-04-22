import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  Icon,
  Box,
  InlineStack,
  Divider,
} from "@shopify/polaris";
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  StoreIcon,
  ViewIcon,
  AppsIcon,
} from "@shopify/polaris-icons";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // Try to get the active theme ID
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
    query getThemes {
      themes(first: 10, roles: [MAIN]) {
        nodes {
          id
          name
          role
        }
      }
    }`
  );
  
  const themesData = await response.json();
  const mainTheme = themesData.data?.themes?.nodes?.find(t => t.role === "MAIN");
  const themeId = mainTheme ? mainTheme.id.split("/").pop() : "";

  return { 
    shop: session.shop,
    themeId,
    clientId: process.env.SHOPIFY_API_KEY || "27bee79bfa6071d88605e515871d4a7d"
  };
};

export default function Guide() {
  const { shop, themeId, clientId } = useLoaderData();
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(1);

  const steps = [
    {
      id: 1,
      title: "Activate App Core",
      subtitle: "The engine must be turned on first",
      icon: PlayIcon,
      description: "To show your Instagram feed, Shopify requires you to 'Enable' our app core in your theme settings. This is a one-time process.",
      actionText: "Open Theme Editor",
      action: () => {
        const url = `https://${shop}/admin/themes/${themeId}/editor?context=apps&activateAppId=${clientId}/app-embed&activateAppEmbed=${clientId}/app-embed`;
        window.open(url, "_blank");
      }
    },
    {
      id: 2,
      title: "Add Visual Sections",
      subtitle: "Place your feed anywhere on your site",
      icon: PlusIcon,
      description: "Navigate to your Home Page or any Other Page in the Theme Editor. Click 'Add Section' on the left sidebar and search for 'Instagram Feed' or 'Instagram Stories'.",
    },
    {
      id: 3,
      title: "Customize Styles",
      subtitle: "Make it match your brand",
      icon: SettingsIcon,
      description: "Once added, click on the section to see customization settings. You can change colors, spacing, columns, and even hide specific posts easily.",
    },
    {
      id: 4,
      title: "Save & Publish",
      subtitle: "Go live in seconds",
      icon: CheckCircleIcon,
      description: "Click the 'Save' button in the top right corner of the Theme Editor. Your beautiful Instagram feed is now live for all your customers to see!",
    }
  ];

  return (
    <div className="premium-dashboard">
      <style>{`
        .guide-step-card {
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          border-left: 4px solid transparent;
          cursor: pointer;
          overflow: hidden;
          position: relative;
        }
        .guide-step-card.active {
          border-left-color: var(--premium-accent);
          background: white;
          box-shadow: 0 10px 25px -5px rgba(225, 48, 108, 0.1);
          transform: translateX(8px);
        }
        .step-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 14px;
          background: #f1f5f9;
          color: #64748b;
          transition: all 0.3s ease;
        }
        .active .step-number {
          background: var(--premium-accent-gradient);
          color: white;
          box-shadow: 0 4px 12px rgba(225, 48, 108, 0.3);
        }
        .visual-display {
          background: #f8fafc;
          border-radius: 24px;
          border: 2px dashed #e2e8f0;
          height: 100%;
          min-height: 400px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
          animation: fadeInBlur 0.6s ease-out;
        }
        .pulse-button {
          animation: pulseShadow 2s infinite;
        }
        @keyframes pulseShadow {
          0% { box-shadow: 0 0 0 0 rgba(225, 48, 108, 0.4); }
          70% { box-shadow: 0 0 0 15px rgba(225, 48, 108, 0); }
          100% { box-shadow: 0 0 0 0 rgba(225, 48, 108, 0); }
        }
        .demo-screenshot {
          width: 100%;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          margin-bottom: 24px;
          border: 1px solid #e2e8f0;
          background: white;
          padding: 8px;
        }
      `}</style>

      <div style={{ maxWidth: "1300px", margin: "0 auto", padding: "0 16px" }}>
        <BlockStack gap="400">
          
          {/* --- PREMIUM HEADER --- */}
          <div className="premium-header" style={{ 
            marginBottom: "24px", display: "flex", justifyContent: "space-between", 
            alignItems: "center", padding: "16px 28px", gap: "16px"
          }}>
            <div className="brand-section">
              <button 
                onClick={() => navigate("/app")}
                style={{ 
                  background: "transparent", border: "none", cursor: "pointer", 
                  display: "flex", alignItems: "center", gap: "16px", padding: 0,
                  color: "white"
                }}
              >
                <div style={{
                  width: "44px", height: "44px", borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", background: "white",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)", transition: "transform 0.2s"
                }} className="back-button-hover">
                  <Icon source={ChevronLeftIcon} tone="base" />
                </div>
                <div style={{ textAlign: "left" }}>
                  <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: "white", letterSpacing: "-0.5px" }}>Guide & Setup</h1>
                  <p style={{ margin: 0, fontSize: "12px", color: "rgba(255, 255, 255, 0.85)", fontWeight: "500" }}>Back to Dashboard</p>
                </div>
              </button>
            </div>

            <div style={{ 
              background: "rgba(255,255,255,0.15)", padding: "12px 20px", borderRadius: "14px", 
              border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(8px)",
              textAlign: "right"
            }}>
              <div style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.9)" }}>Setup Phase</div>
              <div style={{ fontWeight: "900", fontSize: "15px", color: "white" }}>Step {activeStep} of 4</div>
            </div>
          </div>
        <Layout>
          {/* Left Side: Steps List */}
          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              {steps.map((step) => (
                <div 
                  key={step.id} 
                  className={`guide-step-card premium-card ${activeStep === step.id ? 'active' : ''}`}
                  onClick={() => setActiveStep(step.id)}
                  style={{ padding: "20px" }}
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <InlineStack gap="300" blockAlign="center">
                      <div className="step-number">{step.id}</div>
                      <div>
                        <Text variant="bodyMd" fontWeight="bold">{step.title}</Text>
                        <Text variant="bodySm" tone="subdued">{step.subtitle}</Text>
                      </div>
                    </InlineStack>
                    {activeStep === step.id && <Icon source={CheckCircleIcon} tone="success" />}
                  </InlineStack>
                </div>
              ))}
              
              <Box marginTop="400">
                <Card>
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">Need more help?</Text>
                    <Text variant="bodySm" tone="subdued">Our experts can help you set up your feed for free.</Text>
                    <Button variant="plain" onClick={() => window.open("https://www.booststar.in/contact", "_blank")}>Contact Support Expert</Button>
                  </BlockStack>
                </Card>
              </Box>
            </BlockStack>
          </Layout.Section>

          {/* Right Side: Step Detail & Visuals */}
          <Layout.Section>
            <div className="premium-card" style={{ padding: "40px", minHeight: "600px", display: "flex", flexDirection: "column" }}>
              <div style={{ marginBottom: "32px", animation: "slideInRight 0.4s ease-out" }}>
                <InlineStack gap="300" blockAlign="center">
                  <div style={{ 
                    padding: "12px", 
                    borderRadius: "12px", 
                    background: "var(--premium-accent-soft)", 
                    color: "var(--premium-accent)" 
                  }}>
                    <Icon source={steps[activeStep-1].icon} tone="inherit" />
                  </div>
                  <div>
                    <Text variant="headingXl" as="h2">Step {activeStep}: {steps[activeStep-1].title}</Text>
                  </div>
                </InlineStack>
                
                <Box marginTop="400">
                  <Text variant="bodyLg" as="p" tone="subdued">
                    {steps[activeStep-1].description}
                  </Text>
                </Box>

                {steps[activeStep-1].actionText && (
                  <Box marginTop="600">
                    <button 
                      className="premium-button button-accent pulse-button" 
                      onClick={steps[activeStep-1].action}
                    >
                      <Icon source={StoreIcon} tone="inherit" />
                      {steps[activeStep-1].actionText}
                    </button>
                  </Box>
                )}
              </div>

              <Divider />

              {/* Visual Demo / Illustration */}
              <Box marginTop="600" style={{ flex: 1 }}>
                <div className="visual-display">
                  {activeStep === 1 && (
                    <BlockStack gap="500" align="center">
                      <div className="demo-screenshot" style={{ maxWidth: "300px" }}>
                        <div style={{ background: "#f1f5f9", height: "150px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: "80%", height: "20px", background: "#cbd5e1", borderRadius: "10px" }} />
                        </div>
                        <div style={{ padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: "12px", fontWeight: "700" }}>AI Instafeed</span>
                          <div style={{ width: "32px", height: "16px", background: "var(--premium-accent)", borderRadius: "10px" }} />
                        </div>
                      </div>
                      <Text variant="headingMd">Look for the "App Embeds" tab</Text>
                      <Text tone="subdued">Switch the toggle ON to allow the app to run on your store.</Text>
                    </BlockStack>
                  )}

                  {activeStep === 2 && (
                    <BlockStack gap="500" align="center">
                      <div style={{ display: "flex", gap: "20px" }}>
                        <div className="demo-screenshot" style={{ width: "160px" }}>
                          <Icon source={AppsIcon} />
                          <Box marginTop="200"><Text variant="bodySm" fontWeight="bold">Instastory</Text></Box>
                        </div>
                        <div className="demo-screenshot" style={{ width: "160px" }}>
                          <Icon source={ViewIcon} />
                          <Box marginTop="200"><Text variant="bodySm" fontWeight="bold">Instapost</Text></Box>
                        </div>
                      </div>
                      <Text variant="headingMd">Search for our sections</Text>
                      <Text tone="subdued">Click <b>Add Section</b> and choose between 'Stories' or 'Grid' layouts.</Text>
                    </BlockStack>
                  )}

                  {activeStep === 3 && (
                    <BlockStack gap="500" align="center">
                      <div className="demo-screenshot" style={{ width: "240px", padding: "20px" }}>
                        <BlockStack gap="200">
                          <div style={{ height: "8px", width: "40%", background: "#f1f5f9" }} />
                          <div style={{ height: "40px", width: "100%", border: "1px solid #e2e8f0", borderRadius: "6px" }} />
                          <div style={{ height: "8px", width: "60%", background: "#f1f5f9" }} />
                          <div style={{ height: "30px", width: "100%", background: "var(--premium-accent-gradient)", borderRadius: "6px" }} />
                        </BlockStack>
                      </div>
                      <Text variant="headingMd">Adjust Settings Live</Text>
                      <Text tone="subdued">Change fonts, colors, and layouts. See results instantly in the editor.</Text>
                    </BlockStack>
                  )}

                  {activeStep === 4 && (
                    <BlockStack gap="500" align="center">
                      <div style={{ 
                        width: "80px", height: "80px", borderRadius: "50%", 
                        background: "#f0fdf4", color: "#166534", 
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "40px", animation: "logoPulse 2s infinite"
                      }}>
                        <Icon source={CheckCircleIcon} tone="inherit" />
                      </div>
                      <Text variant="headingLg">You are all set!</Text>
                      <Text tone="subdued">Your Instagram feed is now boosting your store's social proof.</Text>
                      <Button variant="primary" onClick={() => navigate("/app")}>Go to Dashboard</Button>
                    </BlockStack>
                  )}
                </div>
              </Box>
              
              <Box marginTop="600">
                <InlineStack align="space-between">
                  <Button 
                    disabled={activeStep === 1} 
                    onClick={() => setActiveStep(prev => prev - 1)}
                  >
                    Previous Step
                  </Button>
                  <Button 
                    variant="primary" 
                    disabled={activeStep === 4} 
                    onClick={() => setActiveStep(prev => prev + 1)}
                  >
                    Next Step
                  </Button>
                </InlineStack>
              </Box>
            </div>
          </Layout.Section>
        </Layout>
        <footer style={{ textAlign: "center", padding: "40px 0", marginTop: "24px" }}>
          <BlockStack gap="200">
            <Text variant="bodySm" tone="subdued">© 2026 AI Instafeed by BOOST STAR Experts</Text>
            <InlineStack gap="200" align="center">
              <Text variant="bodySm" tone="subdued">Terms of Service</Text>
              <Text variant="bodySm" tone="subdued">•</Text>
              <Text variant="bodySm" tone="subdued">Privacy Policy</Text>
            </InlineStack>
          </BlockStack>
        </footer>
        </BlockStack>
      </div>
    </div>
  );
}
