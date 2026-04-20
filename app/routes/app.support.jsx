import { useState, useEffect } from "react";
import whiteLogo from "../image/boost-star-white.png";
import { useLoaderData, useFetcher, useNavigation, Form, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Button,
  BlockStack,
  SkeletonPage,
  SkeletonDisplayText,
  SkeletonBodyText,
  Icon,
  TextField,
  FormLayout,
  Banner,
  InlineStack,
  Divider,
} from "@shopify/polaris";
import { sendSupportEmail } from "../utils/email.server";
import {
  ChevronLeftIcon,
  EmailIcon,
  ChatIcon,
  PhoneIcon,
  QuestionCircleIcon,
  StarIcon,
  MagicIcon,
  PersonIcon,
} from "@shopify/polaris-icons";

// ─────────────────────────────────────────────────────────────────────────────
// LOADER - Fetch shop info if needed
// ─────────────────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return {
    shop: session.shop,
    supportEmail: process.env.SUPPORT_EMAIL || "support@booststar.com",
    whatsappNumber: "+1234567890",
  };
};


// ─────────────────────────────────────────────────────────────────────────────
// ACTION - Handle support form submission
// ─────────────────────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const email = formData.get("email");
  const subject = formData.get("subject");
  const message = formData.get("message");

  // Check if SMTP is configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("SMTP credentials missing in .env file");
    return { 
      success: false, 
      error: "Our mailing system is currently being configured. Please use the direct contact methods on the right for now." 
    };
  }

  const result = await sendSupportEmail({
    from: email,
    subject,
    message,
    shop: session.shop,
  });

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Support() {
  const { shop, supportEmail, whatsappNumber } = useLoaderData();
  const fetcher = useFetcher();
  const shopify = useAppBridge();
  const navigation = useNavigation();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show("Support request sent successfully!");
      setEmail("");
      setSubject("");
      setMessage("");
    } else if (fetcher.data?.error) {
      shopify.toast.show(fetcher.data.error, { isError: true });
    }
  }, [fetcher.data, shopify]);

  if (!isHydrated) {
    return (
      <div style={{ padding: "32px", maxWidth: "1300px", margin: "0 auto" }}>
        <SkeletonPage title="Contact Support" />
      </div>
    );
  }

  return (
    <div className="premium-dashboard page-fade-in">
      <style>{`
        .page-fade-in { animation: fadeInBlur 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
        .support-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .support-link-card {
          transition: all 0.2s ease;
        }
        .support-link-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          background: white !important;
          border-color: #e2e8f0 !important;
        }
        .support-card {
          border-radius: 16px;
          overflow: hidden;
          box-shadow: var(--premium-card-shadow);
        }
        .gradient-text {
          background: var(--premium-accent-gradient);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
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
                  <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "900", color: "white", letterSpacing: "-0.5px" }}>Support Center</h1>
                  <p style={{ margin: 0, fontSize: "12px", color: "rgba(255, 255, 255, 0.85)", fontWeight: "500" }}>Back to Dashboard</p>
                </div>
              </button>
            </div>

            <div style={{ 
              background: "rgba(255,255,255,0.15)", padding: "12px 20px", borderRadius: "14px", 
              border: "1px solid rgba(255,255,255,0.2)", backdropFilter: "blur(8px)",
              textAlign: "right"
            }}>
              <div style={{ fontSize: "10px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "1px", color: "rgba(255,255,255,0.9)" }}>Expert Response</div>
              <div style={{ fontWeight: "900", fontSize: "15px", color: "white" }}>Under 2 hours</div>
            </div>
          </div>

          {/* --- EXPERT CONSULTATION BANNER --- */}
          <div style={{ marginBottom: "24px" }}>
            <Card>
              <div style={{ padding: "20px 24px", background: "linear-gradient(90deg, rgba(225, 48, 108, 0.05) 0%, rgba(255, 255, 255, 0) 100%)", borderRadius: "12px" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="400" blockAlign="center">
                    <div style={{ 
                      padding: "12px", background: "var(--premium-accent-gradient)", 
                      borderRadius: "14px", color: "white",
                      boxShadow: "0 8px 16px -4px rgba(225, 48, 108, 0.4)" 
                    }}>
                      <Icon source={PersonIcon} tone="inherit" />
                    </div>
                    <BlockStack gap="100">
                      <Text variant="headingMd" as="h3">Need a Design Expert?</Text>
                      <Text variant="bodyMd" tone="subdued">
                        Speak with our professional designers to perfectly match your Instagram feed to your store's theme.
                      </Text>
                    </BlockStack>
                  </InlineStack>
                  <Button variant="primary" onClick={() => window.open(`mailto:${supportEmail}?subject=Expert Design Consultation`)}>
                    Get Custom Service
                  </Button>
                </InlineStack>
              </div>
            </Card>
          </div>

          <Layout>
            {/* --- LEFT COLUMN: CONTACT FORM --- */}
            <Layout.Section>
              <Card>
                <div style={{ padding: "8px" }}>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">Send us a message</Text>
                    <fetcher.Form method="post">
                      <FormLayout>
                        <TextField
                          label="Your Email"
                          name="email"
                          value={email}
                          onChange={setEmail}
                          autoComplete="email"
                          placeholder="shop-owner@example.com"
                          requiredIndicator
                        />
                        <TextField
                          label="Subject"
                          name="subject"
                          value={subject}
                          onChange={setSubject}
                          autoComplete="off"
                          placeholder="How can we help?"
                          requiredIndicator
                        />
                        <TextField
                          label="Message"
                          name="message"
                          value={message}
                          onChange={setMessage}
                          multiline={4}
                          autoComplete="off"
                          placeholder="Describe your issue or question in detail..."
                          requiredIndicator
                        />
                        <div style={{ marginTop: "12px" }}>
                          <Button 
                            submit 
                            variant="primary" 
                            size="large" 
                            loading={isSubmitting}
                            fullWidth
                          >
                            Send Message
                          </Button>
                        </div>
                      </FormLayout>
                    </fetcher.Form>
                  </BlockStack>
                </div>
              </Card>

              <div style={{ marginTop: "24px" }}>
                <Card>
                  <div style={{ padding: "8px" }}>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h3">Frequently Asked Questions</Text>
                      <Divider />
                      <BlockStack gap="300">
                        <div style={{ padding: "8px 0" }}>
                          <Text variant="bodyMd" fontWeight="bold">How do I connect my Instagram account?</Text>
                          <Text variant="bodyMd" tone="subdued">Go to the Home tab, enter your Instagram handle, and our AI will automatically fetch your feed.</Text>
                        </div>
                        <Divider />
                        <div style={{ padding: "8px 0" }}>
                          <Text variant="bodyMd" fontWeight="bold">Can I hide specific posts from my feed?</Text>
                          <Text variant="bodyMd" tone="subdued">Yes! Enable "Hide Mode" in the dashboard and click on any post to toggle its visibility.</Text>
                        </div>
                        <Divider />
                        <div style={{ padding: "8px 0" }}>
                          <Text variant="bodyMd" fontWeight="bold">Does the app slow down my website?</Text>
                          <Text variant="bodyMd" tone="subdued">Absolutely not. We use advanced lazy-loading and an optimized CDN to ensure 0ms impact on your SEO.</Text>
                        </div>
                      </BlockStack>
                    </BlockStack>
                  </div>
                </Card>
              </div>
            </Layout.Section>

            {/* --- RIGHT COLUMN: QUICK CONTACT --- */}
            <Layout.Section variant="oneThird">
              <BlockStack gap="400">
                <Card>
                  <div style={{ padding: "8px" }}>
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="h3" alignment="center">Direct Support</Text>
                      <Text variant="bodyMd" tone="subdued" alignment="center">Get in touch through our official channels.</Text>
                      
                      <div className="support-link-card" style={{ 
                        padding: "16px", borderRadius: "12px", border: "1px solid #f1f5f9", 
                        background: "#f8fafc", cursor: "pointer" 
                      }} onClick={() => window.open(`mailto:${supportEmail}`)}>
                        <InlineStack gap="400" align="start" blockAlign="center">
                          <div style={{ background: "#eff6ff", padding: "10px", borderRadius: "10px", color: "#2563eb" }}>
                            <Icon source={EmailIcon} tone="inherit" />
                          </div>
                          <BlockStack gap="0">
                            <Text variant="bodyMd" fontWeight="bold">Email Us</Text>
                            <Text variant="bodySm" tone="subdued">{supportEmail}</Text>
                          </BlockStack>
                        </InlineStack>
                      </div>

                      <div className="support-link-card" style={{ 
                        padding: "16px", borderRadius: "12px", border: "1px solid #f1f5f9", 
                        background: "#f0fdf4", cursor: "pointer" 
                      }} onClick={() => window.open(`https://wa.me/${whatsappNumber.replace("+", "")}`)}>
                        <InlineStack gap="400" align="start" blockAlign="center">
                          <div style={{ background: "#dcfce7", padding: "10px", borderRadius: "10px", color: "#16a34a" }}>
                            <Icon source={ChatIcon} tone="inherit" />
                          </div>
                          <BlockStack gap="0">
                            <Text variant="bodyMd" fontWeight="bold">WhatsApp Expert</Text>
                            <Text variant="bodySm" tone="subdued">Instant Chat Support</Text>
                          </BlockStack>
                        </InlineStack>
                      </div>

                      <div className="support-link-card" style={{ 
                        padding: "16px", borderRadius: "12px", border: "1px solid #f1f5f9", 
                        background: "#fff7ed", cursor: "pointer" 
                      }} onClick={() => navigate("/app/guide")}>
                        <InlineStack gap="400" align="start" blockAlign="center">
                          <div style={{ background: "#ffedd5", padding: "10px", borderRadius: "10px", color: "#d97706" }}>
                            <Icon source={QuestionCircleIcon} tone="inherit" />
                          </div>
                          <BlockStack gap="0">
                            <Text variant="bodyMd" fontWeight="bold">Help Guide</Text>
                            <Text variant="bodySm" tone="subdued">Detailed Instructions</Text>
                          </BlockStack>
                        </InlineStack>
                      </div>
                    </BlockStack>
                  </div>
                </Card>

                <Card>
                  <div style={{ padding: "8px" }}>
                    <BlockStack gap="300" align="center" textAlign="center">
                      <div style={{
                        width: "60px", height: "60px", borderRadius: "50%", 
                        background: "var(--premium-accent-gradient)", margin: "0 auto",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 10px 15px -3px rgba(225, 48, 108, 0.3)"
                      }}>
                        <img 
                          src={whiteLogo} 
                          alt="BOOST STAR Logo" 
                          style={{ width: "32px", height: "auto" }} 
                        />
                      </div>
                      <Text variant="headingMd" alignment="center">BOOST STAR Experts</Text>
                      <Text variant="bodySm" tone="subdued" alignment="center">
                        We are a team of Shopify Experts specialized in social proof and conversion optimization.
                      </Text>
                      <InlineStack align="center">
                        <Badge tone="success">Verified Expert Team</Badge>
                      </InlineStack>
                    </BlockStack>
                  </div>
                </Card>

                <Banner
                  title="Priority Support"
                  tone="info"
                >
                  <p>Pro plan users get priority support and response times under 1 hour.</p>
                </Banner>
              </BlockStack>
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
