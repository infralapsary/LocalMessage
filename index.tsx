import { ChatBarButton, type ChatBarButtonFactory } from "@api/ChatButtons";
import { DataStore } from "@api/index";
import { Devs } from "@utils/constants";
import { ModalContent, ModalFooter, ModalHeader, ModalProps, ModalRoot, openModal } from "@utils/modal";
import definePlugin from "@utils/types";
import {
    Button,
    ChannelStore,
    FluxDispatcher,
    React,
    SelectedChannelStore,
    SnowflakeUtils,
    TextInput,
    UserStore,
    showToast,
    Toasts,
    useState,
    useRef,
} from "@webpack/common";

const STORE_KEY = "LocalDMTroll_v1";

type SavedMsg = {
    id: string;
    channel_id: string;
    author: any;
    content: string;
    timestamp: string;
    attachments: any[];
};

let cache: Record<string, SavedMsg[]> = {};

async function loadStore() {
    const data = await DataStore.get(STORE_KEY);
    cache = data || {};
}

async function saveStore() {
    await DataStore.set(STORE_KEY, cache);
}

function isDM(id: string) {
    const ch = ChannelStore.getChannel(id);
    return !!ch && (ch.type === 1 || ch.type === 3);
}

function getThem(channelId: string) {
    const ch = ChannelStore.getChannel(channelId);
    if (!ch) return null;
    const rid = (ch as any).recipients?.[0] ?? (ch as any).recipientId;
    return rid ? UserStore.getUser(rid) : null;
}

function dispatchMsg(msg: SavedMsg) {
    FluxDispatcher.dispatch({
        type: "MESSAGE_CREATE",
        channelId: msg.channel_id,
        message: {
            ...msg,
            edited_timestamp: null,
            tts: false,
            mention_everyone: false,
            mentions: [],
            mention_roles: [],
            embeds: [],
            pinned: false,
            type: 0,
            flags: 0,
            components: [],
            nonce: msg.id,
            state: "SENT",
        },
        optimistic: false,
    });
}

function inject(channelId: string, content: string, imageDataUrl?: string | null, imageName?: string) {
    const them = getThem(channelId);
    if (!them) {
        showToast("Could not resolve user", Toasts.Type.FAILURE);
        return;
    }

    const id = SnowflakeUtils.fromTimestamp(Date.now());
    const attachments: any[] = [];

    if (imageDataUrl) {
        attachments.push({
            id: SnowflakeUtils.fromTimestamp(Date.now() + 1),
            filename: imageName || "image.png",
            url: imageDataUrl,
            proxy_url: imageDataUrl,
            size: Math.floor(imageDataUrl.length * 0.75),
            content_type: imageDataUrl.startsWith("data:image/jpeg") ? "image/jpeg" : "image/png",
            width: 800,
            height: 600,
            content_scan_version: 1,
        });
    }

    const saved: SavedMsg = {
        id,
        channel_id: channelId,
        author: {
            id: them.id,
            username: them.username,
            discriminator: them.discriminator ?? "0",
            avatar: them.avatar,
            bot: false,
            global_name: (them as any).globalName ?? them.username,
            public_flags: (them as any).publicFlags ?? 0,
        },
        content: content || "",
        timestamp: new Date().toISOString(),
        attachments,
    };

    if (!cache[channelId]) cache[channelId] = [];
    cache[channelId].push(saved);
    saveStore();

    dispatchMsg(saved);
    showToast(`from ${them.username}`, Toasts.Type.SUCCESS);
}

function restoreChannel(channelId: string) {
    const list = cache[channelId];
    if (!list?.length) return;
    // small delay so Discord finishes loading the channel first
    setTimeout(() => {
        for (const msg of list) dispatchMsg(msg);
    }, 400);
}

function TrollModal({ rootProps, channelId, close }: { rootProps: ModalProps; channelId: string; close: () => void; }) {
    const [text, setText] = useState("");
    const [image, setImage] = useState<string | null>(null);
    const [imageName, setImageName] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);
    const them = getThem(channelId);

    const onFile = (e: any) => {
        const file = e.target.files?.[0];
        if (!file || !file.type.startsWith("image/")) {
            showToast("Only images", Toasts.Type.FAILURE);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setImage(reader.result as string);
            setImageName(file.name);
        };
        reader.readAsDataURL(file);
    };

    const send = () => {
        if (!text.trim() && !image) return;
        inject(channelId, text.trim(), image, imageName);
        setText("");
        setImage(null);
        setImageName("");
        close();
    };

    return (
        <ModalRoot {...rootProps} size="medium">
            <ModalHeader>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {them?.avatar && (
                        <img
                            src={`https://cdn.discordapp.com/avatars/${them.id}/${them.avatar}.webp?size=64`}
                            width={32}
                            height={32}
                            style={{ borderRadius: "50%" }}
                        />
                    )}
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16 }}>Send as {them?.username ?? "them"}</div>
                        <div style={{ fontSize: 12, opacity: 0.6 }}>saved locally · survives restart</div>
                    </div>
                </div>
            </ModalHeader>

            <ModalContent>
                <div style={{ padding: "12px 0", display: "flex", flexDirection: "column", gap: 12 }}>
                    <TextInput
                        value={text}
                        onChange={setText}
                        placeholder="What would they say..."
                        onKeyDown={(e: any) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                send();
                            }
                        }}
                        autoFocus
                    />

                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onFile} />

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Button onClick={() => fileRef.current?.click()} look={Button.Looks.OUTLINED} color={Button.Colors.PRIMARY} size={Button.Sizes.SMALL}>
                            {image ? "Change image" : "Add image"}
                        </Button>
                        {image && (
                            <Button onClick={() => { setImage(null); setImageName(""); }} look={Button.Looks.LINK} color={Button.Colors.RED} size={Button.Sizes.SMALL}>
                                Remove
                            </Button>
                        )}
                    </div>

                    {image && (
                        <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid var(--background-modifier-accent)", maxHeight: 220 }}>
                            <img src={image} alt="preview" style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 220 }} />
                        </div>
                    )}
                </div>
            </ModalContent>

            <ModalFooter>
                <Button onClick={send} color={Button.Colors.BRAND} disabled={!text.trim() && !image}>
                    Send as {them?.username ?? "them"}
                </Button>
                <Button onClick={close} look={Button.Looks.LINK} color={Button.Colors.PRIMARY}>
                    Cancel
                </Button>
            </ModalFooter>
        </ModalRoot>
    );
}

const TrollButton: ChatBarButtonFactory = props => {
    if (!props.isAnyChat) return null;
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId || !isDM(channelId)) return null;

    return (
        <div style={{ opacity: 0, width: 28, height: 28, overflow: "hidden" }}>
            <ChatBarButton
                tooltip=""
                onClick={() => {
                    openModal(modalProps => (
                        <TrollModal rootProps={modalProps} channelId={channelId} close={() => modalProps.onClose()} />
                    ));
                }}
            >
                <span style={{ width: 20, height: 20, display: "block" }} />
            </ChatBarButton>
        </div>
    );
};

export default definePlugin({
    name: "LocalDMTroll",
    description: "Invisible button → modal → text/image as them. Saved locally, survives restart.",
    authors: [Devs.Ven],
    dependencies: ["ChatInputButtonAPI"],

    chatBarButton: {
        icon: () => null as any,
        render: TrollButton,
    },

    async start() {
        await loadStore();

        // restore when you open a DM
        FluxDispatcher.subscribe("CHANNEL_SELECT", ({ channelId }: any) => {
            if (channelId && isDM(channelId)) restoreChannel(channelId);
        });

        // restore current channel if already in a DM
        const cur = SelectedChannelStore.getChannelId();
        if (cur && isDM(cur)) restoreChannel(cur);
    },
});
