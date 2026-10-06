export type ImageKind = 'poll' | 'words' | 'qr';
export type AssetBinding = { base: string; session: string; sceneId: string };
export type AssetBridge = {
  insert: (image: string, kind: ImageKind, binding: AssetBinding) => Promise<void>;
  sync: (images: Record<ImageKind, string>, binding: AssetBinding) => Promise<number>;
};

// One SDK command at a time: Asc.scope is shared by serialized commands.
export function createAssetBridge(): AssetBridge {
  let queue = Promise.resolve<unknown>(undefined);
  let blocked = false;
  function command<T>(scope: Record<string, unknown>, fn: () => unknown): Promise<T> {
    const pending = queue.then(
      () =>
        new Promise<T>((resolve, reject) => {
          if (blocked) {
            reject(new Error('Commande non confirmée. Fermez puis rouvrez le plugin.'));
            return;
          }
          Object.assign(Asc.scope, scope);
          const timeout = setTimeout(() => {
            // A delayed editor command must never read a later command's image arguments.
            blocked = true;
            reject(
              new Error('Commande non confirmée. Vérifiez la diapositive puis rouvrez le plugin.'),
            );
          }, 15_000);
          try {
            Asc.plugin.callCommand(fn, false, true, (result) => {
              clearTimeout(timeout);
              const value = result as { ok?: boolean; value?: T; error?: string } | undefined;
              if (value?.ok) resolve(value.value as T);
              else
                reject(new Error(value?.error || 'Commande impossible. Utilisez le mode édition.'));
            });
          } catch (e) {
            clearTimeout(timeout);
            blocked = true;
            reject(e);
          }
        }),
    );
    queue = pending.catch(() => undefined);
    return pending;
  }
  function prefix(binding: AssetBinding) {
    return `PaloAltoLive:v2:${encodeURIComponent(binding.base)}:${binding.session}:`;
  }
  return {
    async insert(image, kind, binding) {
      const decoded = new Image();
      decoded.src = image;
      await decoded.decode();
      // Some desktop plugin schemes do not expose randomUUID (secure-context-only).
      const uuid =
        crypto.randomUUID?.() ||
        Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
          n.toString(16).padStart(2, '0'),
        ).join('');
      const name = `${prefix(binding)}${kind === 'qr' ? 'join' : binding.sceneId}:${kind}:${uuid}`;
      await command<void>(
        { paloaltoAsset: { image, name, ratio: decoded.width / decoded.height } },
        // ONLYOFFICE serializes this function: use only Api and Asc.scope inside it.
        function () {
          try {
            const presentation = Api.GetPresentation();
            const slide = presentation.GetCurrentSlide();
            if (!slide)
              return { ok: false, error: 'Sélectionnez une diapositive en mode édition.' };
            const asset = Asc.scope.paloaltoAsset as { image: string; name: string; ratio: number };
            const width = presentation.GetWidth(),
              height = presentation.GetHeight();
            const w = Math.min(width * 0.48, height * 0.6 * asset.ratio),
              h = w / asset.ratio;
            // A rectangle with a PNG fill supports safe replacement of just the picture.
            const graphic = Api.CreateShape(
              'rect',
              w,
              h,
              Api.CreateBlipFill(asset.image, 'stretch'),
              Api.CreateStroke(0, Api.CreateNoFill()),
            );
            if (typeof graphic.SetName !== 'function' || graphic.SetName(asset.name) === false)
              return {
                ok: false,
                error: 'Les graphiques liés nécessitent ONLYOFFICE 9.3 ou plus récent.',
              };
            graphic.SetPosition((width - w) / 2, (height - h) / 2);
            slide.AddObject(graphic);
            graphic.Select();
            return { ok: true };
          } catch {
            return { ok: false, error: 'Insertion impossible. Revenez au mode édition.' };
          }
        },
      );
    },
    sync(images, binding) {
      return command<number>(
        {
          paloaltoSync: {
            images,
            prefix: prefix(binding),
            legacyPrefix: `PaloAltoLive:v1:${encodeURIComponent(binding.base)}:`,
            sceneId: binding.sceneId,
          },
        },
        function () {
          try {
            const input = Asc.scope.paloaltoSync as {
              images: Record<'poll' | 'words' | 'qr', string>;
              prefix: string;
              legacyPrefix: string;
              sceneId: string;
            };
            let updated = 0;
            // Scan the linked, ungrouped shapes without selecting or replacing any object.
            for (const slide of Api.GetPresentation().GetAllSlides()) {
              for (const shape of slide.GetAllShapes()) {
                if (typeof shape.GetName !== 'function')
                  return {
                    ok: false,
                    error: 'Les graphiques liés nécessitent ONLYOFFICE 9.3 ou plus récent.',
                  };
                const name = shape.GetName();
                const modern = name.startsWith(input.prefix);
                if (!modern && !name.startsWith(input.legacyPrefix)) continue;
                const tag = name
                  .slice(modern ? input.prefix.length : input.legacyPrefix.length)
                  .split(':');
                const kind = tag[1];
                if (tag.length !== 3 || !['poll', 'words', 'qr'].includes(kind)) continue;
                // v1 QR objects have no session binding and cannot safely be rebound.
                if (!modern && kind === 'qr') continue;
                if (tag[0] !== (kind === 'qr' ? 'join' : input.sceneId)) continue;
                const image = input.images[kind as 'poll' | 'words' | 'qr'];
                if (shape.SetFill(Api.CreateBlipFill(image, 'stretch')) === false)
                  return {
                    ok: false,
                    error: 'Actualisation impossible. Vérifiez le mode édition.',
                  };
                updated++;
              }
            }
            return { ok: true, value: updated };
          } catch {
            return { ok: false, error: 'Actualisation impossible. Vérifiez le mode édition.' };
          }
        },
      );
    },
  };
}
